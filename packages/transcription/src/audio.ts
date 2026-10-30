import { open } from 'node:fs/promises';
import type { ToolPaths } from './config.js';
import type { AudioChunk } from './types.js';
import { WorkerFailed, WorkerProcess, runToCompletion } from './worker.js';

export const MODEL_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const HEADER_BYTES = 44;

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

/** Chunks decoded at once while assembling. */
const ASSEMBLE_WORKERS = 3;

/**
 * Decodes a track's chunks into one 16 kHz mono WAV on the meeting timeline.
 * Each chunk goes at its own stamp, never after the one before: sample counts
 * do not place audio, gaps stay silent, and no error can build up over 8 hours.
 */
export async function assembleChunks(
  tools: ToolPaths,
  chunks: AudioChunk[],
  wavPath: string,
  signal?: AbortSignal,
  onFraction?: (fraction: number) => void,
): Promise<void> {
  const output = await open(wavPath, 'w');
  let next = 0;
  let done = 0;
  let endByte = HEADER_BYTES;
  const worker = async (): Promise<void> => {
    for (;;) {
      const chunk = chunks[next++];
      if (!chunk) return;
      const pcm = await decodeChunk(tools, chunk.path, signal);
      const position = HEADER_BYTES + BYTES_PER_SAMPLE * Math.round((chunk.startMs * MODEL_RATE) / 1000);
      await output.write(Buffer.from(pcm.buffer), 0, pcm.byteLength, position);
      endByte = Math.max(endByte, position + pcm.byteLength);
      onFraction?.(++done / chunks.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: ASSEMBLE_WORKERS }, worker));
    await output.write(wavHeader(endByte - HEADER_BYTES), 0, HEADER_BYTES, 0);
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
