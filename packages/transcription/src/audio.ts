import { open, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolPaths } from './config.js';
import type { AudioChunk } from './types.js';
import { WorkerFailed, WorkerProcess, runToCompletion } from './worker.js';

export const MODEL_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
/** Chunks closer than this count as continuous audio. */
const CONTIGUOUS_MS = 30;

export function wavHeader(dataBytes: number, rate = MODEL_RATE): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVEfmt ', 8, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * BYTES_PER_SAMPLE, 28);
  h.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function pcmToWav(samples: Int16Array): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  return Buffer.concat([wavHeader(data.length), data]);
}

/** Splits chunks into stretches with no gap, so pauses stay silent in the WAV. */
export function contiguousRuns(chunks: AudioChunk[]): AudioChunk[][] {
  const sorted = [...chunks].sort((a, b) => a.startMs - b.startMs);
  const runs: AudioChunk[][] = [];
  let end = Number.NEGATIVE_INFINITY;
  for (const chunk of sorted) {
    const run = runs.at(-1);
    if (run && Math.abs(chunk.startMs - end) <= CONTIGUOUS_MS) run.push(chunk);
    else runs.push([chunk]);
    end = chunk.startMs + chunk.durationMs;
  }
  return runs;
}

function concatList(chunks: AudioChunk[]): string {
  const lines = ['ffconcat version 1.0'];
  for (const c of chunks) lines.push(`file '${c.path.replaceAll("'", "'\\''")}'`);
  return lines.join('\n') + '\n';
}

/**
 * Decodes a track's chunks into one 16 kHz mono WAV on the meeting timeline.
 * Each run of chunks starts at its stamped position, so gaps stay gaps and any
 * rounding inside a run is corrected at the next one.
 */
export async function assembleChunks(
  tools: ToolPaths,
  chunks: AudioChunk[],
  wavPath: string,
  workDir: string,
  signal?: AbortSignal,
  onFraction?: (fraction: number) => void,
): Promise<void> {
  const runs = contiguousRuns(chunks);
  const total = chunks.reduce((sum, c) => sum + c.durationMs, 0) || 1;
  const output = await open(wavPath, 'w');
  let doneMs = 0;
  let endByte = 0;
  try {
    for (const [i, run] of runs.entries()) {
      const list = join(workDir, `concat-${i}.txt`);
      await writeFile(list, concatList(run));
      const worker = new WorkerProcess({
        name: 'ffmpeg',
        command: tools.ffmpeg,
        args: ['-nostdin', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
          '-ac', '1', '-ar', String(MODEL_RATE), '-f', 's16le', 'pipe:1'],
        ...(signal ? { signal } : {}),
      });
      const firstMs = run[0]!.startMs;
      let position = 44 + 2 * Math.round((firstMs * MODEL_RATE) / 1000);
      for await (const data of worker.stdout as AsyncIterable<Buffer>) {
        await output.write(data, 0, data.length, position);
        position += data.length;
      }
      const exit = await worker.done;
      await rm(list, { force: true });
      if (exit.code !== 0) throw new WorkerFailed('ffmpeg', exit);
      endByte = Math.max(endByte, position);
      doneMs += run.reduce((sum, c) => sum + c.durationMs, 0);
      onFraction?.(doneMs / total);
    }
    await output.write(wavHeader(Math.max(0, endByte - 44)), 0, 44, 0);
  } finally {
    await output.close();
  }
}

/** Decodes one saved chunk for the live pass. */
export async function decodeChunk(
  tools: ToolPaths,
  path: string,
  signal?: AbortSignal,
): Promise<Int16Array> {
  const worker = new WorkerProcess({
    name: 'ffmpeg',
    command: tools.ffmpeg,
    args: ['-nostdin', '-v', 'error', '-i', path, '-ac', '1', '-ar', String(MODEL_RATE),
      '-f', 's16le', 'pipe:1'],
    ...(signal ? { signal } : {}),
  });
  const parts: Buffer[] = [];
  for await (const data of worker.stdout as AsyncIterable<Buffer>) parts.push(data);
  const exit = await worker.done;
  if (exit.code !== 0) throw new WorkerFailed('ffmpeg', exit);
  const all = Buffer.concat(parts);
  const copy = new Int16Array(Math.floor(all.length / 2));
  Buffer.from(copy.buffer).set(all.subarray(0, copy.length * 2));
  return copy;
}

export interface ProbeResult {
  formatName: string;
  durationMs: number | null;
  audioCodec: string | null;
  channels: number;
  sampleRate: number;
  /** A real video stream; cover art does not count. */
  hasVideo: boolean;
}

export async function probe(
  tools: ToolPaths,
  path: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const out = await runToCompletion({
    name: 'ffprobe',
    command: tools.ffprobe,
    args: ['-v', 'error', '-of', 'json', '-show_format', '-show_streams', path],
    ...(signal ? { signal } : {}),
  });
  return parseProbe(out);
}

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  channels?: number;
  sample_rate?: string;
  disposition?: { attached_pic?: number };
}

export function parseProbe(json: string): ProbeResult {
  const raw = JSON.parse(json) as {
    format?: { format_name?: string; duration?: string };
    streams?: RawStream[];
  };
  const streams = raw.streams ?? [];
  const audio = streams.find((s) => s.codec_type === 'audio');
  const duration = Number(raw.format?.duration);
  return {
    formatName: raw.format?.format_name ?? '',
    durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
    audioCodec: audio?.codec_name ?? null,
    channels: audio?.channels ?? 0,
    sampleRate: Number(audio?.sample_rate ?? 0),
    hasVideo: streams.some((s) => s.codec_type === 'video' && !s.disposition?.attached_pic),
  };
}
