import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { probe, type ProbeResult } from './audio.js';
import type { ModelPaths, ToolPaths } from './config.js';
import { clearPreSkip } from './ogg.js';
import { runFinalPass, type FinalPassOptions } from './finalPass.js';
import type { AudioChunk, FinalPhase, FinalTranscript, Progress, RecordingGuard } from './types.js';
import { WorkerFailed, WorkerProcess } from './worker.js';

/** The app's audio format: Phase 0 settled mono 32 kbps Opus in 5 s chunks. */
export const CHUNK_SECONDS = 5;
export const OPUS_BITRATE = '32k';
const OPUS_RATE = 48_000;
const MODEL_RATE = 16_000;
const IMPORT_MARK = '.importing-';
const GUARD_POLL_MS = 500;

export type ImportFailure =
  | 'not_found'
  | 'no_permission'
  | 'unsupported_format'
  | 'video_not_accepted'
  | 'no_audio'
  | 'unreadable'
  | 'disk_full'
  | 'recording_active'
  | 'cancelled'
  | 'transcription_failed';

const MESSAGES: Record<ImportFailure, string> = {
  not_found: 'That file could not be found. It may have been moved or deleted.',
  no_permission: 'Meeting Scribe is not allowed to read that file.',
  unsupported_format: 'This file type is not supported. Use WAV, MP3, M4A, FLAC or Opus audio.',
  video_not_accepted: 'This is a video file. Only audio files can be imported.',
  no_audio: 'This file does not contain any audio.',
  unreadable: 'This file could not be read. It may be damaged or incomplete.',
  disk_full: 'There is not enough free disk space to import this file.',
  recording_active: 'Import stopped because a recording is in progress. Try again after it ends.',
  cancelled: 'Import cancelled.',
  transcription_failed: 'The audio could not be transcribed. Nothing was imported.',
};

export class ImportError extends Error {
  /** Safe to show the user as it is. */
  readonly userMessage: string;
  constructor(
    readonly code: ImportFailure,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ImportError';
    this.userMessage = MESSAGES[code];
  }
}

const EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.flac', '.opus', '.ogg']);

/** Accepts only the required formats, judged by content and not by file name. */
export function checkProbe(info: ProbeResult): ImportFailure | null {
  if (info.hasVideo) return 'video_not_accepted';
  if (!info.audioCodec) return 'no_audio';
  const format = info.formatName.split(',');
  const codec = info.audioCodec;
  const fine =
    (format.includes('wav') || format.includes('w64')) ||
    format.includes('mp3') ||
    format.includes('flac') ||
    (format.includes('m4a') && (codec === 'aac' || codec === 'alac' || codec === 'mp3')) ||
    (format.includes('ogg') && (codec === 'opus' || codec === 'flac'));
  return fine ? null : 'unsupported_format';
}

/** Two outputs from one decode: Opus chunks to keep and a 16 kHz WAV for the models. */
export function decodeArgs(source: string, chunkDir: string, listPath: string, wavPath: string): string[] {
  return ['-nostdin', '-hide_banner', '-v', 'error', '-progress', 'pipe:1', '-i', source,
    '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(OPUS_RATE),
    '-c:a', 'libopus', '-b:a', OPUS_BITRATE, '-application', 'voip', '-frame_duration', '20',
    '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), '-segment_format', 'ogg',
    '-segment_list', listPath, '-segment_list_type', 'csv', '-reset_timestamps', '1',
    join(chunkDir, '%06d.opus'),
    '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(MODEL_RATE), '-c:a', 'pcm_s16le', wavPath];
}

export function parseChunkList(csv: string, dir: string): AudioChunk[] {
  const chunks: AudioChunk[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const [file, start, end] = line.split(',');
    if (!file || start === undefined || end === undefined) continue;
    const startMs = Math.round(Number(start) * 1000);
    chunks.push({ path: join(dir, file), startMs, durationMs: Math.round(Number(end) * 1000) - startMs });
  }
  return chunks;
}

export type ImportPhase = 'decoding' | FinalPhase;

export interface ImportOptions {
  tools: ToolPaths;
  sourcePath: string;
  /** The meeting folder to create; it must not exist yet. */
  meetingDir: string;
  /** With models, the final pass runs before the meeting appears. */
  transcribe?: { models: ModelPaths } & Pick<
    FinalPassOptions,
    'threads' | 'useGpu' | 'language' | 'vocabularyHint' | 'relabel'
  >;
  recording?: RecordingGuard;
  signal?: AbortSignal;
  onProgress?: (p: Progress<ImportPhase>) => void;
}

export interface ImportResult {
  meetingDir: string;
  sourceName: string;
  /** Defaults the meeting's date. */
  fileDate: Date;
  durationMs: number;
  chunks: AudioChunk[];
  /** Decoded less audio than the file claims to hold, usually a cut-off file. */
  truncated: boolean;
  transcript?: FinalTranscript;
}

/** What an import writes in `audio/meeting/`, read back by later passes. */
export const CHUNK_MANIFEST = 'chunks.json';

/**
 * Imports one audio file as a meeting.  Everything is built in a hidden sibling
 * folder and renamed into place as the last step, so a failure or cancel at any
 * point leaves no meeting.  The source file is only ever read.
 */
export async function importAudioFile(o: ImportOptions): Promise<ImportResult> {
  const staging = `${o.meetingDir}${IMPORT_MARK}${randomBytes(4).toString('hex')}`;
  const stop = new AbortController();
  const guard = watchRecording(o.recording, stop);
  const cancel = (): void => stop.abort();
  if (o.signal?.aborted) cancel();
  else o.signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (o.recording?.isRecording()) throw new ImportError('recording_active');
    const info = await checkSource(o, stop.signal);
    await ensureSpace(dirname(o.meetingDir), info.durationMs);
    await mkdir(dirname(o.meetingDir), { recursive: true });

    const stagedChunks = join(staging, 'audio', 'meeting');
    await mkdir(stagedChunks, { recursive: true });
    const listPath = join(staging, 'chunks.csv');
    const wavPath = join(staging, 'model-input.wav');

    await decode(o, stop.signal, stagedChunks, listPath, wavPath, info.durationMs);

    const staged = parseChunkList(await readFile(listPath, 'utf8'), stagedChunks);
    for (const chunk of staged.slice(1)) await clearPreSkip(chunk.path);
    const wavBytes = (await stat(wavPath)).size - 44;
    const durationMs = Math.round((wavBytes / 2 / MODEL_RATE) * 1000);
    if (staged.length === 0 || durationMs <= 0) throw new ImportError('unreadable', 'no audio decoded');
    const truncated = info.durationMs !== null && info.durationMs - durationMs > 2000;

    let transcript: FinalTranscript | undefined;
    if (o.transcribe) {
      const { models, ...rest } = o.transcribe;
      try {
        transcript = await runFinalPass({
          ...rest,
          tools: o.tools,
          models,
          tracks: [{ kind: 'meeting', source: { wavPath } }],
          workDir: join(staging, 'work'),
          signal: stop.signal,
          ...(o.onProgress ? { onProgress: o.onProgress } : {}),
        });
      } catch (err) {
        if (stop.signal.aborted) throw err;
        throw new ImportError('transcription_failed', (err as Error).message);
      }
      await writeFile(join(staging, 'transcript.final.json'), JSON.stringify(transcript));
    }

    const relative = staged.map((c) => ({ ...c, path: basename(c.path) }));
    await writeFile(join(stagedChunks, CHUNK_MANIFEST), JSON.stringify({ version: 1, chunks: relative }));
    await rm(listPath);
    await rm(wavPath);

    const fileDate = (await stat(o.sourcePath)).mtime;
    if (stop.signal.aborted) throw new ImportError('cancelled');
    await rename(staging, o.meetingDir);
    const finalDir = join(o.meetingDir, 'audio', 'meeting');
    return {
      meetingDir: o.meetingDir,
      sourceName: basename(o.sourcePath),
      fileDate,
      durationMs,
      chunks: relative.map((c) => ({ ...c, path: join(finalDir, c.path) })),
      truncated,
      ...(transcript ? { transcript } : {}),
    };
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw classify(err, o.recording, stop.signal);
  } finally {
    clearInterval(guard);
    o.signal?.removeEventListener('abort', cancel);
  }
}

function watchRecording(recording: RecordingGuard | undefined, stop: AbortController): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (recording?.isRecording()) stop.abort();
  }, GUARD_POLL_MS);
  timer.unref();
  return timer;
}

function classify(err: unknown, recording: RecordingGuard | undefined, signal: AbortSignal): ImportError {
  if (signal.aborted && !(err instanceof ImportError && err.code === 'recording_active')) {
    return new ImportError(recording?.isRecording() ? 'recording_active' : 'cancelled');
  }
  if (err instanceof ImportError) return err;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'ENOSPC') return new ImportError('disk_full');
  return new ImportError('unreadable', (err as Error).message);
}

async function checkSource(o: ImportOptions, signal: AbortSignal): Promise<ProbeResult> {
  try {
    await access(o.sourcePath, constants.R_OK);
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
    throw new ImportError(missing ? 'not_found' : 'no_permission');
  }
  if ((await stat(o.sourcePath)).isDirectory()) throw new ImportError('unsupported_format');
  const known = EXTENSIONS.has(extname(o.sourcePath).toLowerCase());
  let info: ProbeResult;
  try {
    info = await probe(o.tools, o.sourcePath, signal);
  } catch (err) {
    if (signal.aborted) throw err;
    if (err instanceof WorkerFailed && err.exit.spawnError) throw err;
    throw new ImportError(known ? 'unreadable' : 'unsupported_format');
  }
  const failure = checkProbe(info);
  if (failure) throw new ImportError(failure);
  if (!known) throw new ImportError('unsupported_format');
  return info;
}

/** About 32 kB/s for the model WAV and 4 kB/s for Opus, doubled for safety. */
async function ensureSpace(dir: string, durationMs: number | null): Promise<void> {
  if (durationMs === null) return;
  let parent = dir;
  for (;;) {
    try {
      const fs = await statfs(parent);
      if (fs.bavail * fs.bsize < (durationMs / 1000) * 36_000 * 2) throw new ImportError('disk_full');
      return;
    } catch (err) {
      if (err instanceof ImportError) throw err;
      const up = dirname(parent);
      if (up === parent) return;
      parent = up;
    }
  }
}

async function decode(
  o: ImportOptions,
  signal: AbortSignal,
  chunkDir: string,
  listPath: string,
  wavPath: string,
  durationMs: number | null,
): Promise<void> {
  const worker = new WorkerProcess({
    name: 'ffmpeg',
    command: o.tools.ffmpeg,
    args: decodeArgs(o.sourcePath, chunkDir, listPath, wavPath),
    signal,
  });
  const lines = createInterface({ input: worker.stdout });
  for await (const line of lines) {
    const m = /^out_time_us=(\d+)/.exec(line);
    if (m && durationMs) {
      o.onProgress?.({
        phase: 'decoding',
        fraction: Math.min(1, Number(m[1]) / 1000 / durationMs),
      });
    }
  }
  const exit = await worker.done;
  if (exit.code !== 0) {
    if (exit.spawnError) throw new WorkerFailed('ffmpeg', exit);
    throw new ImportError(/No space left/i.test(exit.stderrTail) ? 'disk_full' : 'unreadable', exit.stderrTail);
  }
  o.onProgress?.({ phase: 'decoding', fraction: 1 });
}

/** Removes staging folders left by a crash mid-import.  Run at app start. */
export async function sweepAbandonedImports(meetingsDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(meetingsDir);
  } catch {
    return [];
  }
  const swept = names.filter((n) => n.includes(IMPORT_MARK));
  await Promise.all(swept.map((n) => rm(join(meetingsDir, n), { recursive: true, force: true })));
  return swept;
}

export async function readChunkManifest(meetingDir: string): Promise<AudioChunk[]> {
  const dir = join(meetingDir, 'audio', 'meeting');
  const parsed = JSON.parse(await readFile(join(dir, CHUNK_MANIFEST), 'utf8')) as { chunks: AudioChunk[] };
  return parsed.chunks.map((c) => ({ ...c, path: join(dir, c.path) }));
}
