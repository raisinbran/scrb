import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { ContractError, type TrackKind } from '@scrb/contracts';
import type { Library } from '@scrb/storage';

type LibraryAccess = Pick<Library, 'getMeeting' | 'meetingPaths'>;
export const MAX_RANGE = 1024 * 1024;
const CHUNK_NAME = /^\d{6,}\.opus$/;
const TRACKS: readonly TrackKind[] = ['microphone', 'meeting'];
const NS_PER_MS = 1e6;

export interface PlaybackChunk {
  track: TrackKind;
  file: string;
  startMs: number;
  endMs: number;
}

export interface PlaybackTimeline {
  /** Still being written, so more chunks may follow the last one listed. */
  live: boolean;
  chunks: PlaybackChunk[];
}

export interface PlaybackSpot {
  /** Where audio really is: the request itself, or the next audio after a gap. */
  positionMs: number;
  chunks: PlaybackChunk[];
  nextPositionMs: number | null;
}

function unavailable(): never {
  throw new ContractError({ code: 'notFound', message: 'Saved audio is unavailable.' });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validChunk(track: TrackKind, row: Record<string, unknown>): PlaybackChunk | null {
  const { file, startNs, endNs } = row;
  if (typeof file !== 'string' || !CHUNK_NAME.test(file)) return null;
  if (!Number.isSafeInteger(startNs) || !Number.isSafeInteger(endNs)) return null;
  const [start, end] = [startNs as number, endNs as number];
  if (start < 0 || end <= start) return null;
  // Whole milliseconds, because positions go back through `getPlaybackMedia` validation.
  const [startMs, endMs] = [Math.round(start / NS_PER_MS), Math.round(end / NS_PER_MS)];
  return endMs > startMs ? { track, file, startMs, endMs } : null;
}

/** Only complete lines of closed chunks count. The writer is never blocked or asked anything. */
async function liveChunks(folder: string, track: TrackKind): Promise<PlaybackChunk[]> {
  const text = await readFile(join(folder, 'chunks.log'), 'utf8').catch(() => '');
  const lines = text.split('\n');
  lines.pop(); // Empty after a final newline; otherwise a line still being written.
  const chunks: PlaybackChunk[] = [];
  for (const line of lines) {
    try {
      const row = record(JSON.parse(line));
      const chunk = row && typeof row['closeReason'] === 'string' && validChunk(track, row);
      const last = chunks.at(-1);
      if (chunk && (!last || chunk.startMs > last.startMs)) chunks.push(chunk);
    } catch {
      // A damaged log line proves no finished chunk.
    }
  }
  return chunks;
}

/** One bad manifest loses only its own track: the other one may still play. */
async function sealedChunks(
  folder: string,
  track: TrackKind,
  origin: 'recorded' | 'imported',
): Promise<PlaybackChunk[]> {
  try {
    const manifest = record(JSON.parse(await readFile(join(folder, 'chunks.json'), 'utf8')));
    if (
      !manifest ||
      manifest['schemaVersion'] !== 2 ||
      manifest['origin'] !== origin ||
      !Array.isArray(manifest['chunks']) ||
      !Array.isArray(manifest['gaps'])
    )
      return [];
    const chunks: PlaybackChunk[] = [];
    for (const entry of manifest['chunks'] as unknown[]) {
      const row = record(entry);
      const chunk = row && validChunk(track, row);
      const last = chunks.at(-1);
      if (
        !row ||
        !chunk ||
        (row['state'] !== 'complete' && row['state'] !== 'recovered') ||
        (last && chunk.startMs <= last.startMs)
      )
        return [];
      chunks.push(chunk);
    }
    return chunks;
  } catch {
    return [];
  }
}

/** Every chunk a meeting may play right now, validated afresh. No path leaves this module. */
export async function readPlaybackTimeline(
  library: LibraryAccess,
  meetingId: string,
): Promise<PlaybackTimeline> {
  const meeting = await library.getMeeting(meetingId).catch(unavailable);
  if (meeting.audioDeletedAt !== null || meeting.status === 'importing') return unavailable();
  const { audio } = library.meetingPaths(meetingId);
  const live = meeting.status === 'recording';
  const tracks = await Promise.all(
    TRACKS.map((track) => {
      const folder = join(audio, track);
      return live ? liveChunks(folder, track) : sealedChunks(folder, track, meeting.source);
    }),
  );
  return { live, chunks: tracks.flat() };
}

/** What plays at a position. A gap with no track moves forward and keeps original timeline time. */
export function locatePlayback(chunks: PlaybackChunk[], positionMs: number): PlaybackSpot | null {
  const at = (ms: number) => chunks.filter(({ startMs, endMs }) => startMs <= ms && ms < endMs);
  const later = (ms: number) => chunks.filter(({ startMs }) => startMs > ms).map((c) => c.startMs);
  let position = positionMs;
  if (at(position).length === 0) {
    const starts = later(position);
    if (starts.length === 0) return null;
    position = Math.min(...starts);
  }
  // Rollovers can overlap slightly, so the newest chunk of a track wins.
  const current = TRACKS.flatMap((track) => {
    const covering = at(position).filter((chunk) => chunk.track === track);
    return covering.length > 0 ? [covering.at(-1) as PlaybackChunk] : [];
  });
  const boundary = Math.min(...current.map(({ endMs }) => endMs), ...later(position));
  const after = at(boundary).length > 0 ? boundary : Math.min(Infinity, ...later(boundary));
  return {
    positionMs: position,
    chunks: current,
    nextPositionMs: Number.isFinite(after) ? after : null,
  };
}

/** Read at most 1 MiB from a sealed, meeting-authorized chunk; registration is separate. */
export async function readPlaybackChunk(
  library: LibraryAccess,
  meetingId: string,
  track: TrackKind,
  file: string,
  start: number,
  length: number,
): Promise<{ bytes: Buffer; totalBytes: number }> {
  if (
    !CHUNK_NAME.test(file) ||
    (track !== 'meeting' && track !== 'microphone') ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > MAX_RANGE
  )
    return unavailable();

  const { chunks } = await readPlaybackTimeline(library, meetingId);
  if (!chunks.some((chunk) => chunk.track === track && chunk.file === file)) return unavailable();

  const paths = library.meetingPaths(meetingId);
  const audioRoot = paths.audio;
  const folder = join(audioRoot, track);
  const path = join(folder, file);
  const [meetingReal, audioReal, rootReal, targetReal, info, meetingInfo] = await Promise.all([
    realpath(paths.folder),
    realpath(audioRoot),
    realpath(folder),
    realpath(path),
    lstat(path),
    lstat(paths.folder),
  ]).catch(unavailable);
  if (
    meetingInfo.isSymbolicLink() ||
    !info.isFile() ||
    info.isSymbolicLink() ||
    !audioReal.startsWith(meetingReal + sep) ||
    !rootReal.startsWith(audioReal + sep) ||
    !targetReal.startsWith(rootReal + sep)
  )
    return unavailable();

  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(
    unavailable,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || start >= stat.size) return unavailable();
    const size = Math.min(length, stat.size - start);
    const bytes = Buffer.alloc(size);
    const { bytesRead } = await handle.read(bytes, 0, size, start);
    return { bytes: bytes.subarray(0, bytesRead), totalBytes: stat.size };
  } finally {
    await handle.close();
  }
}
