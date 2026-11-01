import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { errorFields, type Library } from '@scrb/storage';
import {
  toModelReplacement,
  vocabularyHint,
  LargeModelGate,
  type ImportResult,
  type ImportPhase,
  type Progress,
} from '@scrb/app-core';
import {
  ContractError,
  type ActiveImport,
  type BackendEvents,
  type EventName,
  type ImportFailureReason,
} from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;
type RunImport = (input: {
  sourcePath: string;
  meetingDir: string;
  signal: AbortSignal;
  vocabularyHint?: string;
  onProgress: (progress: Progress<ImportPhase>) => void;
}) => Promise<ImportResult>;

export interface ImportDependencies {
  library: Library;
  chooseFile(): Promise<string | null>;
  run: RunImport;
  recordingBusy(): boolean;
  privacyBanner(): Promise<boolean>;
  emit: Emit;
  removeStaging?: (folder: string) => Promise<void>;
  modelGate?: LargeModelGate;
}

const IMPORT_STAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.import-[0-9a-f]{8})?$/i;

const STAGES: Record<ImportPhase, ActiveImport['stage']> = {
  decoding: 'decoding',
  assembling: 'transcribing',
  transcribing: 'transcribing',
  diarizing: 'diarizing',
  done: 'finishing',
};

/** One model-heavy import at a time. File selection grants no general filesystem access to the UI. */
export class ImportCoordinator {
  private readonly localGate = new LargeModelGate();
  private readonly tokens = new Map<string, string>();
  private starting = false;
  private running: {
    state: ActiveImport;
    abort: AbortController;
    done: Promise<void>;
  } | null = null;
  private readonly completed = new Set<string>();
  private interruptedByRecording = false;

  constructor(private readonly deps: ImportDependencies) {}

  /** On single-instance startup, clean only our own aborted, UUID-named import scratch folders. */
  async recoverInterrupted(): Promise<void> {
    if (this.running || this.starting) {
      throw new ContractError({ code: 'conflict', message: 'An import is running.' });
    }
    const stageRoot = join(this.deps.library.paths.cache, 'imports');
    const entries = await readdir(stageRoot, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      this.deps.library.logger.log('warn', 'import-recovery-scan-failed', errorFields(error));
      return [];
    });
    for (const entry of entries) {
      if (!entry.isDirectory() || !IMPORT_STAGE_NAME.test(entry.name)) continue;
      try {
        if (this.deps.removeStaging) await this.deps.removeStaging(join(stageRoot, entry.name));
        else await rm(join(stageRoot, entry.name), { recursive: true, force: true });
      } catch (error) {
        this.deps.library.logger.log('warn', 'import-recovery-cleanup-failed', errorFields(error));
      }
    }
  }

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
    return {
      fileToken,
      fileName: basename(file),
      sizeBytes: info.size,
      fileDate: info.mtime.toISOString(),
    };
  }

  private async start(input: { fileToken: string; buildVoiceProfiles: boolean }): Promise<{
    importId: string;
    privacyBannerRequired: boolean;
  }> {
    if (this.running || this.starting || this.deps.recordingBusy()) {
      throw new ContractError({
        code: 'conflict',
        message: 'Finish recording or importing first.',
      });
    }
    this.starting = true;
    let sourcePath: string;
    let privacyBannerRequired: boolean;
    try {
      const selected = this.tokens.get(input.fileToken);
      if (!selected) {
        throw new ContractError({ code: 'notFound', message: 'Choose the audio file again.' });
      }
      sourcePath = selected;
      privacyBannerRequired = await this.deps.privacyBanner().catch(() => true);
      if (this.deps.recordingBusy()) {
        throw new ContractError({ code: 'conflict', message: 'Recording took priority.' });
      }
      this.tokens.delete(input.fileToken);
    } finally {
      this.starting = false;
    }
    const importId = randomUUID();
    const state: ActiveImport = {
      importId,
      fileName: basename(sourcePath),
      stage: 'queued',
      fraction: 0,
      cancelling: false,
    };
    const abort = new AbortController();
    const done = this.perform(state, sourcePath, abort, input.buildVoiceProfiles);
    this.interruptedByRecording = false;
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
    const stageRoot = join(library.paths.cache, 'imports');
    const staging = join(stageRoot, state.importId);
    let meetingId: string | null = null;
    try {
      await mkdir(stageRoot, { recursive: true });
      if (abort.signal.aborted) throw new Error('cancelled');
      const result = await (this.deps.modelGate ?? this.localGate).run(() => this.deps.run({
        sourcePath,
        meetingDir: staging,
        signal: abort.signal,
        vocabularyHint: vocabularyHint(library.vocabulary.enabledTerms()),
        onProgress: (progress) => {
          state.stage = STAGES[progress.phase];
          state.fraction = Math.max(0, Math.min(1, progress.fraction));
          this.deps.emit('importProgress', {
            importId: state.importId,
            fileName: state.fileName,
            stage: state.stage,
            fraction: state.fraction,
          });
        },
      }), abort.signal);
      if (abort.signal.aborted) throw new Error('cancelled');
      if (!result.transcript) throw new Error('Final transcription was not produced');
      const created = await library.createMeeting({
        title: state.fileName,
        source: 'imported',
        status: 'importing',
        date: result.fileDate.toISOString(),
        durationMs: result.durationMs,
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
      if (abort.signal.aborted && this.interruptedByRecording) {
        this.deps.emit('importFailed', {
          importId: state.importId,
          fileName: state.fileName,
          reason: 'recordingInProgress',
          message: 'Recording took priority. Retry the import.',
        });
      } else if (abort.signal.aborted) {
        this.deps.emit('importCancelled', { importId: state.importId, fileName: state.fileName });
      } else {
        const code = (error as { code?: string }).code;
        const reason: ImportFailureReason =
          code === 'disk_full'
            ? 'diskFull'
            : code === 'recording_active'
              ? 'recordingInProgress'
              : code === 'unsupported_format' || code === 'video_not_accepted'
                ? 'unsupportedFormat'
                : code === 'no_permission' || code === 'not_found' || code === 'unreadable'
                  ? 'unreadable'
                  : 'internal';
        this.deps.emit('importFailed', {
          importId: state.importId,
          fileName: state.fileName,
          reason,
          message:
            reason === 'diskFull'
              ? 'There is not enough space to import this audio.'
              : reason === 'recordingInProgress'
                ? 'Recording took priority. Retry the import.'
                : reason === 'unsupportedFormat'
                  ? 'This audio format is not supported.'
                  : 'Import did not finish. No meeting was saved.',
        });
      }
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      this.completed.add(state.importId);
      if (this.completed.size > 50)
        this.completed.delete(this.completed.values().next().value as string);
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
    this.interruptedByRecording = true;
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
      importAudioFile: (input) =>
        this.start(input as { fileToken: string; buildVoiceProfiles: boolean }),
      cancelImport: (input) => this.cancel((input as { importId: string }).importId),
    };
  }
}
