import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { errorFields, type Library } from '@scrb/storage';
import {
  toModelReplacement,
  vocabularyHint,
  type LargeModelGate,
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
  beforeDelete?: (meetingId: string) => void;
  removeStaging?: ((folder: string) => Promise<void>) | undefined;
  modelGate?: LargeModelGate;
}

const IMPORT_STAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.importing-[0-9a-f]{8})?$/i;

const STAGES: Record<ImportPhase, ActiveImport['stage']> = {
  decoding: 'decoding',
  assembling: 'transcribing',
  transcribing: 'transcribing',
  diarizing: 'diarizing',
  done: 'finishing',
};

/** One model-heavy import at a time. File selection grants no general filesystem access to the UI. */
export class ImportCoordinator {
  private readonly tokens = new Map<string, { path: string; pickedAt: number }>();
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
    this.tokens.set(fileToken, { path: file, pickedAt: Date.now() });
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
      if (!selected || Date.now() - selected.pickedAt > 600_000) {
        this.tokens.delete(input.fileToken);
        throw new ContractError({ code: 'notFound', message: 'Choose the audio file again.' });
      }
      sourcePath = selected.path;
      privacyBannerRequired = input.buildVoiceProfiles
        ? await this.deps.privacyBanner().catch(() => true)
        : false;
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
    this.interruptedByRecording = false;
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
    const stageRoot = join(library.paths.cache, 'imports');
    const staging = join(stageRoot, state.importId);
    let meetingId: string | null = null;
    let terminal: {
      event: 'importFinished' | 'importCancelled' | 'importFailed';
      payload: unknown;
    } | null = null;
    let cleanupIncomplete = false;
    try {
      await mkdir(stageRoot, { recursive: true });
      if (abort.signal.aborted) throw new Error('cancelled');
      const job = () =>
        this.deps.run({
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
        });
      const result = this.deps.modelGate
        ? await this.deps.modelGate.run(job, abort.signal)
        : await job();
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
      terminal = { event: 'importFinished', payload: { importId: state.importId, meetingId } };
    } catch (error) {
      if (meetingId !== null) {
        try {
          this.deps.beforeDelete?.(meetingId);
          const report = await library.discardImport(meetingId);
          if (!report.ok) {
            cleanupIncomplete = true;
            library.logger.log('error', 'import-discard-incomplete', {
              meetingId,
              leftCount: report.remaining.length,
            });
          }
        } catch (cleanupError) {
          cleanupIncomplete = true;
          library.logger.log('error', 'import-discard-failed', {
            meetingId,
            ...errorFields(cleanupError),
          });
        }
      }
      if (abort.signal.aborted && this.interruptedByRecording) {
        terminal = {
          event: 'importFailed',
          payload: {
            importId: state.importId,
            fileName: state.fileName,
            reason: 'recordingInProgress',
            message: 'Recording took priority. Retry the import.',
          },
        };
      } else if (abort.signal.aborted) {
        terminal = {
          event: 'importCancelled',
          payload: { importId: state.importId, fileName: state.fileName },
        };
      } else {
        const code = (error as { code?: string }).code;
        const cause = (error as { cause?: { code?: unknown; syscall?: unknown } }).cause;
        library.logger.log('error', 'import-failed', {
          stage: state.stage,
          ...errorFields(error),
          osCode: cause?.code ?? 'none',
          syscall: cause?.syscall ?? 'none',
        });
        const reason: ImportFailureReason =
          code === 'disk_full'
            ? 'diskFull'
            : code === 'recording_active'
              ? 'recordingInProgress'
              : code === 'unsupported_format' || code === 'video_not_accepted'
                ? 'unsupportedFormat'
                : code === 'no_permission' ||
                    code === 'not_found' ||
                    code === 'unreadable' ||
                    code === 'no_audio'
                  ? 'unreadable'
                  : 'internal';
        terminal = {
          event: 'importFailed',
          payload: {
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
          },
        };
      }
    } finally {
      try {
        if (this.deps.removeStaging) await this.deps.removeStaging(staging);
        else await rm(staging, { recursive: true, force: true });
      } catch (cleanupError) {
        cleanupIncomplete = true;
        library.logger.log('error', 'import-stage-cleanup-failed', errorFields(cleanupError));
      }
      if (cleanupIncomplete && terminal?.event !== 'importFinished') {
        terminal = {
          event: 'importFailed',
          payload: {
            importId: state.importId,
            fileName: state.fileName,
            reason: 'internal',
            message: 'Import cleanup was incomplete. Restart to retry recovery.',
          },
        };
      }
      if (terminal?.event === 'importFinished')
        this.deps.emit('importFinished', terminal.payload as BackendEvents['importFinished']);
      else if (terminal?.event === 'importCancelled')
        this.deps.emit('importCancelled', terminal.payload as BackendEvents['importCancelled']);
      else if (terminal?.event === 'importFailed')
        this.deps.emit('importFailed', terminal.payload as BackendEvents['importFailed']);
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
