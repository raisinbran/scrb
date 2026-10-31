import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** Repairs and seals a meeting's audio after a crash or at Stop. See docs/plans/crash-safe-chunks.md. */

export type TrackName = 'microphone' | 'meeting';
const TRACKS: readonly TrackName[] = ['microphone', 'meeting'];

export interface SealedChunk {
  file: string;
  seq: number;
  startNs: number;
  endNs: number;
  rate: number;
  preSkip: number;
  openReason: string;
  closeReason: string;
  state: 'complete' | 'recovered';
}

export interface AudioSpan {
  /** `possiblyMissing`: whole-computer audio sends nothing while the computer is silent. */
  kind: 'paused' | 'audioMissing' | 'possiblyMissing' | 'computerAsleep';
  track: TrackName | 'both';
  startNs: number;
  endNs: number;
}

export interface SealedTrack {
  schemaVersion: 2;
  origin: 'recorded';
  endedBy: 'stop' | 'crash';
  endNs: number;
  chunks: SealedChunk[];
  gaps: AudioSpan[];
}

export interface RecoveredAudio {
  outcome: 'ready' | 'recovered' | 'writerAlive';
  /** Where the recording ended on the timeline. */
  endNs: number;
  tracks: Partial<Record<TrackName, SealedTrack>>;
  /** All spans in timeline order, ready for `transcript.json`. */
  gaps: AudioSpan[];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = (index << 24) >>> 0;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 0x80000000 ? ((value << 1) ^ 0x04c11db7) >>> 0 : (value << 1) >>> 0;
  }
  return value;
});

function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes)
    crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 255] ?? 0)) >>> 0;
  return crc;
}

interface Page {
  start: number;
  end: number;
  flags: number;
  granule: bigint;
  bodyStart: number;
}

/** The pages from the start whose checksums pass. Stops at the first bad one. */
export function readPages(data: Buffer): Page[] {
  const pages: Page[] = [];
  let at = 0;
  while (at + 27 <= data.length && data.toString('latin1', at, at + 4) === 'OggS') {
    const segments = data[at + 26] ?? 0;
    const bodyStart = at + 27 + segments;
    if (bodyStart > data.length) break;
    let bodySize = 0;
    for (let i = 0; i < segments; i += 1) bodySize += data[at + 27 + i] ?? 0;
    const end = bodyStart + bodySize;
    if (end > data.length) break;
    const page = Buffer.from(data.subarray(at, end));
    const stored = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    if (oggCrc(page) !== stored) break;
    pages.push({
      start: at,
      end,
      flags: data[at + 5] ?? 0,
      granule: data.readBigUInt64LE(at + 6),
      bodyStart,
    });
    at = end;
  }
  return pages;
}

interface ChunkFacts {
  seq: number;
  startNs: number;
  rate: number;
  preSkip: number;
  openReason: string;
  endNs: number;
}

/** Reads a chunk's own facts, so the chunk files alone can rebuild the list. */
function chunkFacts(data: Buffer, pages: Page[]): ChunkFacts | null {
  const [head, tags] = pages;
  const lastAudio = pages.at(-1);
  if (!head || !tags || !lastAudio || pages.length < 3) return null;
  if (data.toString('latin1', head.bodyStart, head.bodyStart + 8) !== 'OpusHead') return null;
  const preSkip = data.readUInt16LE(head.bodyStart + 10);
  const fields = new Map<string, string>();
  let at = tags.bodyStart + 8;
  at += 4 + data.readUInt32LE(at);
  const count = data.readUInt32LE(at);
  at += 4;
  for (let i = 0; i < count; i += 1) {
    const size = data.readUInt32LE(at);
    const [key, ...value] = data.toString('utf8', at + 4, at + 4 + size).split('=');
    fields.set(key ?? '', value.join('='));
    at += 4 + size;
  }
  const startNs = Number(fields.get('START_NS'));
  const rate = Number(fields.get('RATE'));
  const seq = Number(fields.get('SEQUENCE'));
  if (![startNs, rate, seq].every(Number.isFinite)) return null;
  const samples48 = Math.max(Number(lastAudio.granule) - preSkip, 0);
  return {
    seq,
    startNs,
    rate,
    preSkip,
    openReason: fields.get('OPEN_REASON') ?? 'unknown',
    endNs: startNs + Math.round((samples48 / 48000) * 1e9),
  };
}

function writeSafely(path: string, data: Buffer): void {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, 'w');
  writeFileSync(fd, data);
  fsyncSync(fd);
  closeSync(fd);
  renameSync(temporary, path);
}

function moveToDamaged(folder: string, name: string): void {
  mkdirSync(join(folder, 'damaged'), { recursive: true });
  renameSync(join(folder, name), join(folder, 'damaged', name));
}

/** Turns a `.part` into a finished chunk from its good pages. Safe to repeat. */
function repairPart(folder: string, name: string): void {
  const finished = name.replace(/\.part$/, '');
  const partPath = join(folder, name);
  if (existsSync(join(folder, finished))) {
    rmSync(partPath);
    return;
  }
  const data = readFileSync(partPath);
  const pages = readPages(data);
  const last = pages.at(-1);
  if (!last || pages.length < 3 || !chunkFacts(data, pages)) return moveToDamaged(folder, name);
  const repaired = Buffer.from(data.subarray(0, last.end));
  repaired[last.start + 5] = last.flags | 4;
  repaired.writeUInt32LE(0, last.start + 22);
  repaired.writeUInt32LE(oggCrc(repaired.subarray(last.start)), last.start + 22);
  writeSafely(join(folder, finished), repaired);
  rmSync(partPath);
}

function readLogLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const lines: T[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    try {
      if (line) lines.push(JSON.parse(line) as T);
    } catch {
      // A cut-off line is the expected result of a crash mid-write.
    }
  }
  return lines;
}

interface SessionEvent {
  event: 'open' | 'restart' | 'pause' | 'resume' | 'pauseFailed';
  wholeComputer?: boolean;
  atNs: number;
  seq: number;
}

/** Paused spans the session log confirms. A pause with no resume runs to the end of the meeting. */
function pausedSpans(audioDir: string, endNs: number): { startNs: number; endNs: number }[] {
  // File order, not `seq`: each restarted worker numbers its own lines from 1.
  const events = readLogLines<SessionEvent>(join(audioDir, 'session.log'));
  const spans: { startNs: number; endNs: number }[] = [];
  let openedAt: number | null = null;
  for (const { event, atNs } of events) {
    if (event === 'pause') openedAt = atNs;
    if (event === 'resume' && openedAt !== null) {
      spans.push({ startNs: openedAt, endNs: atNs });
      openedAt = null;
    }
  }
  if (openedAt !== null) spans.push({ startNs: openedAt, endNs: Math.max(endNs, openedAt) });
  return spans;
}

/** When each restarted worker opened on the timeline. */
function restartTimes(audioDir: string): number[] {
  return readLogLines<SessionEvent>(join(audioDir, 'session.log'))
    .filter(({ event }) => event === 'restart')
    .map(({ atNs }) => atNs);
}

const MIN_GAP_NS = 2_000_000;

// Timing rounds at each pause and packet edge, so a span this close to a pause is that pause.
const EDGE_TOLERANCE_NS = 100_000_000;

function trackGaps(
  track: TrackName,
  chunks: SealedChunk[],
  paused: { startNs: number; endNs: number }[],
  restarts: number[],
): AudioSpan[] {
  const gaps: AudioSpan[] = [];
  const firstStart = chunks[0]?.startNs;
  // Nothing before the restart survived, so no earlier chunk can show where the gap begins.
  if (firstStart !== undefined && restarts.some((at) => at <= firstStart)) {
    gaps.push({ kind: 'audioMissing', track, startNs: 0, endNs: firstStart });
  }
  for (let i = 1; i < chunks.length; i += 1) {
    const startNs = chunks[i - 1]?.endNs ?? 0;
    const endNs = chunks[i]?.startNs ?? 0;
    if (endNs - startNs < MIN_GAP_NS) continue;
    const confirmed = paused.some(
      (span) =>
        span.startNs - startNs <= EDGE_TOLERANCE_NS &&
        startNs - span.startNs <= EDGE_TOLERANCE_NS &&
        Math.abs(span.endNs - endNs) <= EDGE_TOLERANCE_NS,
    );
    if (confirmed) continue;
    const asleep = chunks[i - 1]?.closeReason === 'sleep';
    gaps.push({ kind: asleep ? 'computerAsleep' : 'audioMissing', track, startNs, endNs });
  }
  return gaps;
}

/** A pause lost nothing, so a worker that was down across one leaves only the time around it. */
function withoutPaused(gap: AudioSpan, paused: { startNs: number; endNs: number }[]): AudioSpan[] {
  let pieces = [gap];
  for (const span of paused) {
    pieces = pieces.flatMap((piece) =>
      span.endNs <= piece.startNs || span.startNs >= piece.endNs
        ? [piece]
        : [
            { ...piece, endNs: span.startNs },
            { ...piece, startNs: span.endNs },
          ],
    );
  }
  return pieces.filter((piece) => piece.endNs - piece.startNs >= MIN_GAP_NS);
}

function sealTrack(
  audioDir: string,
  track: TrackName,
  endedBy: SealedTrack['endedBy'],
): Omit<SealedTrack, 'gaps'> | null {
  const folder = join(audioDir, track);
  if (!existsSync(folder)) return null;
  // Leftovers go first: repairing a part writes and renames a file of the same name.
  for (const name of readdirSync(folder)) {
    if (name.endsWith('.tmp')) rmSync(join(folder, name));
  }
  for (const name of readdirSync(folder)) {
    if (name.endsWith('.opus.part')) repairPart(folder, name);
  }
  const logged = new Map(
    readLogLines<{ file: string; closeReason: string }>(join(folder, 'chunks.log')).map((line) => [
      line.file,
      line,
    ]),
  );
  const chunks: SealedChunk[] = [];
  for (const file of readdirSync(folder)
    .filter((name) => name.endsWith('.opus'))
    .sort()) {
    const data = readFileSync(join(folder, file));
    const facts = chunkFacts(data, readPages(data));
    if (!facts) {
      moveToDamaged(folder, file);
      continue;
    }
    const close = logged.get(file)?.closeReason;
    chunks.push({
      ...facts,
      file,
      closeReason: close ?? 'unknown',
      state: close ? 'complete' : 'recovered',
    });
  }
  return {
    schemaVersion: 2,
    origin: 'recorded',
    endedBy,
    endNs: chunks.at(-1)?.endNs ?? 0,
    chunks,
  };
}

/** A damaged list is rebuilt from the chunks. A newer one is refused, so it is never overwritten. */
function readSealed(path: string): SealedTrack | null {
  if (!existsSync(path)) return null;
  let sealed: SealedTrack;
  try {
    sealed = JSON.parse(readFileSync(path, 'utf8')) as SealedTrack;
  } catch {
    return null;
  }
  if (sealed.schemaVersion > 2) throw new Error(`${path} is from a newer version`);
  return sealed;
}

/**
 * All spans of a sealed meeting in timeline order, without touching its files. `chunks.json` holds
 * only track-level gaps, so paused spans come from the session log. Throws on a damaged file.
 */
export function readSealedGaps(audioDir: string, endNs: number): AudioSpan[] {
  const gaps: AudioSpan[] = pausedSpans(audioDir, endNs).map((span) => ({
    kind: 'paused',
    track: 'both',
    ...span,
  }));
  for (const track of TRACKS) {
    const path = join(audioDir, track, 'chunks.json');
    if (!existsSync(path)) continue;
    gaps.push(...(JSON.parse(readFileSync(path, 'utf8')) as SealedTrack).gaps);
  }
  return gaps.sort((a, b) => a.startNs - b.startNs);
}

/**
 * Seals both tracks. Every step can be repeated, so a crash here just runs it again.
 * `isWriterAlive` must use the real lock: a live worker's files are left alone.
 */
export async function sealAudio(
  audioDir: string,
  isWriterAlive: () => Promise<boolean>,
): Promise<RecoveredAudio> {
  if (await isWriterAlive()) return { outcome: 'writerAlive', endNs: 0, tracks: {}, gaps: [] };

  const logsPresent = TRACKS.some((track) => existsSync(join(audioDir, track, 'chunks.log')));
  const sealed = TRACKS.map((track) => {
    const existing = readSealed(join(audioDir, track, 'chunks.json'));
    if (!logsPresent && existing) return [track, existing] as const;
    return [track, sealTrack(audioDir, track, 'crash')] as const;
  });
  const present = sealed.flatMap(([track, value]) => (value ? [[track, value] as const] : []));
  const restarts = restartTimes(audioDir);
  // The meeting ran at least until the last restart, even if no audio was saved after it.
  const endNs = Math.max(0, ...present.map(([, value]) => value.endNs), ...restarts);
  // A track with no audio cannot show how the recording ended, so it does not decide.
  const withAudio = present.filter(([, value]) => value.chunks.length > 0);
  const stopped =
    withAudio.length > 0 &&
    withAudio.every(([, value]) => value.chunks.at(-1)?.closeReason === 'stop');
  const paused = pausedSpans(audioDir, endNs);

  const wholeComputer = readLogLines<SessionEvent>(join(audioDir, 'session.log')).some(
    ({ event, wholeComputer: value }) => event === 'open' && value === true,
  );
  const tracks: RecoveredAudio['tracks'] = {};
  const gaps: AudioSpan[] = paused.map((span) => ({ kind: 'paused', track: 'both', ...span }));
  for (const [track, value] of present) {
    const found = trackGaps(track, value.chunks, paused, restarts);
    if (value.chunks.length === 0 || (value.endNs < endNs - MIN_GAP_NS && !stopped)) {
      found.push({ kind: 'audioMissing', track, startNs: value.endNs, endNs });
    }
    if (track === 'meeting' && wholeComputer) {
      for (const gap of found) {
        // A silent computer sends nothing, but a dead worker's time is known to be lost.
        const workerDown = restarts.some((at) => gap.startNs <= at && at <= gap.endNs);
        if (gap.kind === 'audioMissing' && !workerDown) gap.kind = 'possiblyMissing';
      }
    }
    const trackLevelGaps = found.flatMap((gap) => withoutPaused(gap, paused));
    const final: SealedTrack = {
      ...value,
      endedBy: stopped ? 'stop' : 'crash',
      gaps: trackLevelGaps,
    };
    writeSafely(join(audioDir, track, 'chunks.json'), Buffer.from(JSON.stringify(final, null, 2)));
    rmSync(join(audioDir, track, 'chunks.log'), { force: true });
    tracks[track] = final;
    gaps.push(...trackLevelGaps);
  }
  rmSync(join(audioDir, 'writer.lock'), { force: true });
  gaps.sort((a, b) => a.startNs - b.startNs);
  return { outcome: stopped ? 'ready' : 'recovered', endNs, tracks, gaps };
}
