import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  errorFields,
  type Library,
  type ModelReplacement,
  type Segment,
  type Speaker,
  type TranscriptFile,
} from '@scrb/storage';
import {
  importAudioFile,
  runFinalPass,
  toolsIn,
  YOU_ID,
  type FinalPassDiagnostics,
  type FinalTranscript,
  type ImportResult,
  type Progress,
  type ImportPhase,
  type FinalPhase,
  type ModelPaths,
  type ToolPaths,
  type TrackInput,
} from '@scrb/transcription';
import type { SealedTrack, TrackName } from './recovery.ts';
import {
  startProfileMatching,
  type ProfileMatchingJob,
  type ProfileAssignmentEdit,
} from './profile-matching.ts';
import { vocabularyHint } from './vocabulary-hints.ts';
import type { LargeModelGate } from './large-model-gate.ts';

export { YOU_ID };
export type { ImportResult, ImportPhase, Progress } from '@scrb/transcription';

const NS_PER_MS = 1e6;

const TRACK_KINDS: readonly (readonly [TrackName, TrackInput['kind']])[] = [
  ['microphone', 'mic'],
  ['meeting', 'meeting'],
];

export const MISSING_TOOLS_MESSAGE =
  'Transcription could not run because its tools or models are missing. Your audio is saved.';
export const WORKER_FAILED_MESSAGE =
  'Transcription stopped because of an error. Your audio is saved.';
export const NOT_ENABLED_MESSAGE =
  'Transcription was interrupted and is not turned on in this build. Your audio is saved.';

export class FinalPassUnavailableError extends Error {
  override readonly name = 'FinalPassUnavailableError';
}

/** What the queue needs from the transcription package. Must leave the audio folder unchanged. */
export type RunFinalPass = (input: {
  tracks: TrackInput[];
  workDir: string;
  signal: AbortSignal;
  vocabularyHint?: string;
  onEmbeddingModel?: (path: string) => void;
  onDiagnostics?: (fields: FinalPassDiagnostics) => void;
  onProgress?: (progress: Progress<FinalPhase>) => void;
}) => Promise<FinalTranscript>;

/** Progress of one meeting's pass, as the queue reports it. */
export interface FinalPassReport {
  meetingId: string;
  stage: 'queued' | 'transcribing' | 'diarizing' | 'finishing';
  /** 0 to 1 across the whole pass; never decreases within one pass. */
  fraction: number;
  startedAt: string;
}

/** Share of the pass each phase takes, from the 13-minute owner run: transcription dominates. */
const PHASE_SPAN: Record<FinalPhase, readonly [FinalPassReport['stage'], number, number]> = {
  assembling: ['transcribing', 0, 0.05],
  transcribing: ['transcribing', 0.05, 0.8],
  diarizing: ['diarizing', 0.8, 0.97],
  done: ['finishing', 0.97, 0.97],
};

/** Maps a phase and its own 0..1 fraction to a stage and a fraction of the whole pass. */
export function overallProgress(
  phase: FinalPhase,
  fraction: number,
): { stage: FinalPassReport['stage']; fraction: number } {
  const [stage, from, to] = PHASE_SPAN[phase];
  const within = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return { stage, fraction: from + (to - from) * within };
}

/** Tracks with audio, in the form the final pass reads. Throws on a damaged `chunks.json`. */
export function sealedTracks(audioDir: string): TrackInput[] {
  return TRACK_KINDS.flatMap(([track, kind]) => {
    const folder = join(audioDir, track);
    const path = join(folder, 'chunks.json');
    if (!existsSync(path)) return [];
    const { chunks } = JSON.parse(readFileSync(path, 'utf8')) as SealedTrack;
    if (chunks.length === 0) return [];
    return [
      {
        kind,
        source: {
          chunks: chunks.map((chunk) => ({
            path: join(folder, chunk.file),
            startMs: chunk.startNs / NS_PER_MS,
            durationMs: (chunk.endNs - chunk.startNs) / NS_PER_MS,
          })),
        },
      },
    ];
  });
}

/** Maps a finished pass to the transcript layer. Each turn has one speaker, so one track. */
export function toModelReplacement(transcript: FinalTranscript): ModelReplacement {
  const segments: Segment[] = transcript.turns.map((turn) => {
    const words = transcript.words.slice(turn.firstWord, turn.firstWord + turn.wordCount);
    return {
      id: randomUUID(),
      speakerId: turn.speakerId,
      track: words[0]?.track === 'mic' ? 'microphone' : 'meeting',
      pass: 'final',
      words: words.map(({ text, startMs, endMs }) => ({
        id: randomUUID(),
        text,
        startMs,
        endMs,
      })),
    };
  });
  const labels = new Map(transcript.speakers.map(({ id, label }) => [id, label]));
  // With no diarization result the pass still gives every meeting word a fallback speaker.
  for (const { speakerId } of segments) {
    if (!labels.has(speakerId)) labels.set(speakerId, `Speaker ${labels.size + 1}`);
  }
  const speakers: Speaker[] = [...labels].map(([id, label]) => ({
    id,
    label,
    name: null,
    profileId: null,
    userNamed: false,
    mergedInto: null,
  }));
  return { segments, speakers };
}

const FINAL_PASS_TOOLS = ['ffmpeg', 'whisperCli', 'sherpaSidecar'] as const;
const FINAL_PASS_MODELS = ['speechFinal', 'vad', 'segmentation', 'embedding'] as const;

interface FinalPassConfig {
  tools: Partial<ToolPaths>;
  models: Partial<ModelPaths>;
}

async function loadSetup(configPath: string): Promise<{ tools: ToolPaths; models: ModelPaths }> {
  let config: FinalPassConfig;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as FinalPassConfig;
  } catch (error) {
    throw new FinalPassUnavailableError('config unreadable', { cause: error });
  }
  const tools = config.tools ?? {};
  const models = config.models ?? {};
  const paths = [
    ...FINAL_PASS_TOOLS.map((key) => tools[key]),
    ...FINAL_PASS_MODELS.map((key) => models[key]),
  ];
  const missing = paths.filter((path) => !path || !existsSync(path));
  if (missing.length > 0) throw new FinalPassUnavailableError(`${missing.length} paths missing`);
  return { tools: toolsIn('', tools), models: models as ModelPaths };
}

/** Imports never publish partial results; the library owns the final meeting commit. */
export function createConfiguredImportRunner(configPath: string) {
  return async (input: {
    sourcePath: string;
    meetingDir: string;
    signal: AbortSignal;
    vocabularyHint?: string;
    onEmbeddingModel?: (path: string) => void;
    onProgress: (progress: Progress<ImportPhase>) => void;
  }): Promise<ImportResult> => {
    const { tools, models } = await loadSetup(configPath);
    input.onEmbeddingModel?.(models.embedding);
    if (!existsSync(tools.ffprobe)) throw new FinalPassUnavailableError('ffprobe is missing');
    return importAudioFile({
      ...input,
      tools,
      transcribe: {
        models,
        ...(input.vocabularyHint ? { vocabularyHint: input.vocabularyHint } : {}),
      },
    });
  };
}

/**
 * The real final pass, set up from a JSON file holding `tools` and `models` paths. The file is
 * read for each meeting, so a missing tool fails that meeting and not the app.
 */
export function createFinalPassRunner(
  configPath: string,
  getThreads?: () => number | undefined,
): RunFinalPass {
  return async ({
    tracks,
    workDir,
    signal,
    vocabularyHint: hint,
    onEmbeddingModel,
    onDiagnostics,
    onProgress,
  }) => {
    const { tools, models } = await loadSetup(configPath);
    const threads = getThreads?.();
    onEmbeddingModel?.(models.embedding);
    return runFinalPass({
      tools,
      models,
      tracks,
      workDir,
      signal,
      ...(threads ? { threads } : {}),
      ...(hint ? { vocabularyHint: hint } : {}),
      ...(onDiagnostics ? { onDiagnostics } : {}),
      ...(onProgress ? { onProgress } : {}),
    });
  };
}

function finalPassDir(library: Library, meetingId: string): string {
  return join(library.meetingCache(meetingId), 'final-pass');
}

/** Runs final passes one at a time, so only one large model is ever loaded. */
export class FinalPassQueue {
  private waiting: string[] = [];
  private running: Promise<void> | null = null;
  private closing = false;
  private readonly abort = new AbortController();

  constructor(
    private readonly library: Library,
    private readonly run: RunFinalPass,
    private readonly modelGate?: LargeModelGate,
    private readonly startMatching = startProfileMatching,
    private readonly onProfileAssignment?: (before: TranscriptFile, after: TranscriptFile) => void,
    private readonly onProgress?: (report: FinalPassReport) => void,
  ) {}

  enqueue(meetingId: string): void {
    if (this.closing) return;
    this.waiting.push(meetingId);
    this.running ??= this.drain();
  }

  /** Resolves once nothing is queued or running. */
  async idle(): Promise<void> {
    await this.running;
  }

  /** Stops the workers. Unfinished meetings keep their status and run on the next launch. */
  async shutdown(): Promise<void> {
    this.closing = true;
    this.waiting = [];
    this.abort.abort();
    await this.running;
  }

  private async drain(): Promise<void> {
    for (let id = this.waiting.shift(); id !== undefined; id = this.waiting.shift()) {
      await this.process(id);
    }
    this.running = null;
  }

  private async process(meetingId: string): Promise<void> {
    const workDir = finalPassDir(this.library, meetingId);
    let matching: ProfileMatchingJob | undefined;
    try {
      matching = this.startMatching(this.library);
    } catch {
      this.library.logger.log('warn', 'profile-matching-skipped', { reason: 'snapshot-failed' });
    }
    let transcript: FinalTranscript | undefined;
    let modelPath: string | undefined;
    const startedAt = new Date().toISOString();
    let reporting = true;
    let last = 0;
    const report = (stage: FinalPassReport['stage'], fraction: number): void => {
      if (!reporting || this.abort.signal.aborted || !this.onProgress) return;
      last = Math.max(last, Math.min(1, fraction));
      try {
        this.onProgress({ meetingId, stage, fraction: last, startedAt });
      } catch {
        // Progress is advisory; a failing listener must not fail the pass.
      }
    };
    try {
      report('queued', 0);
      const tracks = sealedTracks(this.library.meetingPaths(meetingId).audio);
      if (tracks.length > 0) {
        const job = () =>
          this.run({
            tracks,
            workDir,
            signal: this.abort.signal,
            vocabularyHint: vocabularyHint(this.library.vocabulary.enabledTerms()),
            onEmbeddingModel: (path) => {
              modelPath = path;
            },
            onDiagnostics: (fields) =>
              this.library.logger.log('info', 'final-pass-speakers', { ...fields }),
            onProgress: ({ phase, fraction }) => {
              const next = overallProgress(phase, fraction);
              report(next.stage, next.fraction);
            },
          });
        transcript = this.modelGate
          ? await this.modelGate.run(job, this.abort.signal)
          : await job();
        this.abort.signal.throwIfAborted();
        await this.library.applyFinalPass(meetingId, toModelReplacement(transcript));
      }
      this.abort.signal.throwIfAborted();
      await this.library.updateMeeting(meetingId, { status: 'ready', transcriptionFailure: null });
      report('finishing', 1);
      if (transcript && matching) {
        let edit: ProfileAssignmentEdit | undefined;
        try {
          edit = await matching(meetingId, transcript, modelPath, this.abort.signal);
        } catch {
          this.library.logger.log('warn', 'profile-matching-skipped', {
            reason: 'optional-failure',
          });
        }
        if (edit && this.onProfileAssignment) {
          try {
            this.onProfileAssignment(edit.before, edit.after);
          } catch {
            this.library.logger.log('warn', 'profile-matching-notification-failed', {});
          }
        }
      }
    } catch (error) {
      reporting = false;
      if (this.abort.signal.aborted) return;
      await this.fail(meetingId, error);
    } finally {
      reporting = false;
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async fail(meetingId: string, error: unknown): Promise<void> {
    this.library.logger.log('error', 'final-pass-failed', { meetingId, ...errorFields(error) });
    try {
      await this.library.updateMeeting(meetingId, {
        status: 'transcriptionFailed',
        transcriptionFailure:
          error instanceof FinalPassUnavailableError
            ? MISSING_TOOLS_MESSAGE
            : WORKER_FAILED_MESSAGE,
      });
    } catch (saveError) {
      // The status stays `finalPassRunning`, so the pass is tried again on the next launch.
      this.library.logger.log('error', 'final-pass-status-failed', {
        meetingId,
        ...errorFields(saveError),
      });
    }
  }
}

/** Picks up passes a quit or crash cut short. With no queue, ends them so none spins forever. */
export async function resumeFinalPasses(
  library: Library,
  queue: FinalPassQueue | null,
): Promise<void> {
  for (const meetingId of library.openReport.interruptedFinalPasses) {
    if (queue) queue.enqueue(meetingId);
    else {
      await rm(finalPassDir(library, meetingId), { recursive: true, force: true });
      await library.updateMeeting(meetingId, {
        status: 'transcriptionFailed',
        transcriptionFailure: NOT_ENABLED_MESSAGE,
      });
    }
  }
}
