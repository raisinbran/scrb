import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { ContractError } from '@scrb/contracts';
import type { Library } from '@scrb/storage';

type Track = 'microphone' | 'meeting';
type LibraryAccess = Pick<Library, 'getMeeting' | 'meetingPaths'>;
const MAX_RANGE = 1024 * 1024;
const CHUNK_NAME = /^\d{6,}\.opus$/;

function unavailable(): never {
  throw new ContractError({ code: 'notFound', message: 'Saved audio is unavailable.' });
}

/** Validate manifest membership before any file access; no local path crosses to the renderer. */
async function allowedChunk(
  folder: string,
  recordedLive: boolean,
  expectedOrigin: 'recorded' | 'imported',
  file: string,
): Promise<boolean> {
  if (recordedLive) {
    const text = await readFile(join(folder, 'chunks.log'), 'utf8').catch(() => '');
    const fullLines = text.split('\n');
    if (!text.endsWith('\n')) fullLines.pop();
    for (const line of fullLines) {
      if (!line) continue;
      try {
        const row: unknown = JSON.parse(line);
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const item = row as Record<string, unknown>;
        if (item['file'] === file && typeof item['closeReason'] === 'string') return true;
      } catch {
        // A partial log line proves no finished chunk.
      }
    }
    return false;
  }
  const raw: unknown = JSON.parse(await readFile(join(folder, 'chunks.json'), 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const manifest = raw as Record<string, unknown>;
  if (
    manifest['schemaVersion'] !== 2 ||
    manifest['origin'] !== expectedOrigin ||
    !Array.isArray(manifest['chunks']) ||
    !Array.isArray(manifest['gaps'])
  ) return false;
  return manifest['chunks'].some((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const chunk = entry as Record<string, unknown>;
    return (
      chunk['file'] === file &&
      chunk['state'] === 'complete' &&
      typeof chunk['startNs'] === 'number' &&
      typeof chunk['endNs'] === 'number' &&
      Number.isSafeInteger(chunk['startNs']) &&
      Number.isSafeInteger(chunk['endNs']) &&
      chunk['startNs'] >= 0 &&
      chunk['endNs'] > chunk['startNs']
    );
  });
}

/** Read at most 1 MiB from a sealed, meeting-authorized chunk; registration is separate. */
export async function readPlaybackChunk(
  library: LibraryAccess,
  meetingId: string,
  track: Track,
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
  ) return unavailable();

  const meeting = await library.getMeeting(meetingId).catch(unavailable);
  if (meeting.audioDeletedAt !== null || meeting.status === 'importing') return unavailable();
  const paths = library.meetingPaths(meetingId);
  const audioRoot = paths.audio;
  const folder = join(audioRoot, track);
  let valid = false;
  try {
    valid = await allowedChunk(folder, meeting.status === 'recording', meeting.source, file);
  } catch {
    return unavailable();
  }
  if (!valid) return unavailable();

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
  ) return unavailable();

  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(unavailable);
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
