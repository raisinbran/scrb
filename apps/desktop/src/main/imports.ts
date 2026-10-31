import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Library } from '@scrb/storage';
import { toModelReplacement } from '@scrb/app-core';
import {
  ContractError,
  type ActiveImport,
  type BackendEvents,
  type EventName,
  type ImportFailureReason,
} from '@scrb/contracts';
import type { ImportResult, ImportPhase, Progress } from '@scrb/transcription';
import type { CallHandlers } from './dispatch.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;
type RunImport = (input: {
  sourcePath: string;
  meetingDir: string;
  signal: AbortSignal;
  onProgress: (progress: Progress<ImportPhase>) => void;
}) => Promise<ImportResult>;

export interface ImportDependencies {
  library: Library;
  chooseFile(): Promise<string | null>;
  run: RunImport;
  recordingBusy(): boolean;
  privacyBanner(): Promise<boolean>;
  emit: Emit;
}

const STAGES: Record<ImportPhase, ActiveImport['stage']> = {
  decoding: 'decoding',
  assembling: 'transcribing',
  transcribing: 'transcribing',
  diarizing: 'diarizing',
  done: 'finishing',
};

/** One model-heavy import at a time. File selection grants no general filesystem access to the UI. */
export class ImportCoordinator {
  private readonly tokens = new Map<string, string>();
  private running: {
    state: ActiveImport;
    abort: AbortController;
    done: Promise<void>;
  } | null = null;
  private readonly completed = new Set<string>();

  constructor(private readonly deps: ImportDependencies) {}

  private async pick(): Promise<{
    fileToken: string;
    fileName: string;
    sizeBytes: number;
    fileDate: string;
  } | null> {
    const file = await this.deps.chooseFile();
    if (!file) return null;
    const info = await stat(file);
    if (!info.isFile()) {
      throw new ContractError({ code: 'invalidRequest', message: 'Select an audio file.' });
    }
    const fileToken = randomUUID();
    if (this.tokens.size >= 8) this.tokens.delete(this.tokens.keys().next().value as string);
    this.tokens.set(fileToken, file);
    return { fileToken, fileName: basename(file), sizeBytes: info.size, fileDate: info.mtime.toISOString() };
  }

  private async start(input: { fileToken: string; buildVoiceProfiles: boolean }): Promise<{
    importId: string;
    privacyBannerRequired: boolean;
  }> {
    if (this.running || this.deps.recordingBusy()) {
      throw new ContractError({ code: 'conflict', message: 'Finish recording or importing first.' });
    }
    const sourcePath = this.tokens.get(input.fileToken);
    if (!sourcePath) {
      throw new ContractError({ code: 'notFound', message: 'Choose the audio file again.' });
    }
    const privacyBannerRequired = await this.deps.privacyBanner().catch(() => true);
    this.tokens.delete(input.fileToken);
    const importId = randomUUID();
    const state: ActiveImport = {
      importId, fileName: basename(sourcePath), stage: 'queued', fraction: 0, cancelling: false,
    };
    const abort = new AbortController();
    const done = this.perform(state, sourcePath, abort, input.buildVoiceProfiles);
    this.running = { state, abort, done };
    return { importId, privacyBannerRequired };
  }

  private async perform(
    state: ActiveImport,
    sourcePath: string,
    abort: AbortController,
    buildVoiceProfiles: boolean,
  ): Promise<void> {
    const library = this.deps.library;
    const stageRoot = join(library.paths.root, 'cache', 'imports');
    const staging = join(stageRoot, state.importId);
    let meetingId: string | null = null;
    try {
      await mkdir(stageRoot, { recursive: true });
      const result = await this.deps.run({
        sourcePath, meetingDir: staging, signal: abort.signal,
        onProgress: (progress) => {
          state.stage = STAGES[progress.phase];
          state.fraction = Math.max(0, Math.min(1, progress.fraction));
          this.deps.emit('importProgress', {
            importId: state.importId, fileName: state.fileName,
            stage: state.stage, fraction: state.fraction,
          });
        },
      });
      if (abort.signal.aborted) throw new Error('cancelled');
      if (!result.transcript) throw new Error('Final transcription was not produced');
      const created = await library.createMeeting({
        title: state.fileName, source: 'imported', status: 'importing',
        date: result.fileDate.toISOString(), durationMs: result.durationMs,
        buildVoiceProfiles,
      });
      meetingId = created.id;
      const target = library.meetingPaths(meetingId).audioMeeting;
      const from = join(staging, 'audio', 'meeting');
      await cp(from, target, { recursive: true });
      if (abort.signal.aborted) throw new Error('cancelled');
      await library.applyFinalPass(meetingId, toModelReplacement(result.transcript));
      if (abort.signal.aborted) throw new Error('cancelled');
      await library.updateMeeting(meetingId, { status: 'ready' });
      this.deps.emit('importFinished', { importId: state.importId, meetingId });
    } catch (error) {
      if (meetingId !== null) {
        try {
          await library.discardImport(meetingId);
        } catch {
          // Reconciliation on next open handles unfinished import folders.
        }
      }
      if (abort.signal.aborted) {
        this.deps.emit('importCancelled', { importId: state.importId, fileName: state.fileName });
      } else {
        const code = (error as { code?: string }).code;
        const reason: ImportFailureReason =
          code === 'disk_full' ? 'diskFull' :
          code === 'recording_active' ? 'recordingInProgress' :
          code === 'unsupported_format' || code === 'video_not_accepted' ? 'unsupportedFormat' :
          code === 'no_permission' || code === 'not_found' || code === 'unreadable' ? 'unreadable' :
          'internal';
        this.deps.emit('importFailed', {
          importId: state.importId, fileName: state.fileName, reason,
          message: reason === 'diskFull' ? 'There is not enough space to import this audio.' :
            reason === 'recordingInProgress' ? 'Recording took priority. Retry the import.' :
            reason === 'unsupportedFormat' ? 'This audio format is not supported.' :
            'Import did not finish. No meeting was saved.',
        });
      }
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      this.completed.add(state.importId);
      if (this.completed.size > 50) this.completed.delete(this.completed.values().next().value as string);
      if (this.running?.state.importId === state.importId) this.running = null;
    }
  }

  private async cancel(importId: string): Promise<void> {
    if (this.completed.has(importId)) return;
    if (this.running?.state.importId !== importId) {
      throw new ContractError({ code: 'notFound', message: 'No matching import was found.' });
    }
    this.running.state.cancelling = true;
    this.running.abort.abort();
    await this.running.done;
  }

  list(): ActiveImport[] {
    return this.running ? [{ ...this.running.state }] : [];
  }

  async stopForRecording(): Promise<void> {
    const running = this.running;
    if (!running) return;
    running.state.cancelling = true;
    running.abort.abort();
    await running.done;
  }

  async shutdown(): Promise<void> {
    await this.stopForRecording();
    this.tokens.clear();
  }

  get handlers(): CallHandlers {
    return {
      pickAudioFile: () => this.pick(),
      importAudioFile: (input) => this.start(input as { fileToken: string; buildVoiceProfiles: boolean }),
      cancelImport: (input) => this.cancel((input as { importId: string }).importId),
    };
  }
}
