import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  errorFields,
  type Library,
  type ModelReplacement,
  type Segment,
  type Speaker,
} from '@scrb/storage';
import {
  runFinalPass,
  toolsIn,
  YOU_ID,
  type FinalTranscript,
  type ModelPaths,
  type ToolPaths,
  type TrackInput,
} from '@scrb/transcription';
import type { SealedTrack, TrackName } from './recovery.ts';

export { YOU_ID };

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
}) => Promise<FinalTranscript>;

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

/**
 * The real final pass, set up from a JSON file holding `tools` and `models` paths. The file is
 * read for each meeting, so a missing tool fails that meeting and not the app.
 */
export function createFinalPassRunner(configPath: string): RunFinalPass {
  return async ({ tracks, workDir, signal }) => {
    const { tools, models } = await loadSetup(configPath);
    return runFinalPass({ tools, models, tracks, workDir, signal });
  };
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
    try {
      const tracks = sealedTracks(this.library.meetingPaths(meetingId).audio);
      if (tracks.length > 0) {
        const transcript = await this.run({
          tracks,
          workDir: join(this.library.meetingCache(meetingId), 'final-pass'),
          signal: this.abort.signal,
        });
        await this.library.applyFinalPass(meetingId, toModelReplacement(transcript));
      }
      await this.library.updateMeeting(meetingId, { status: 'ready', transcriptionFailure: null });
    } catch (error) {
      if (this.abort.signal.aborted) return;
      await this.fail(meetingId, error);
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
      await library.updateMeeting(meetingId, {
        status: 'transcriptionFailed',
        transcriptionFailure: NOT_ENABLED_MESSAGE,
      });
    }
  }
}
