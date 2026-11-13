import { open } from 'node:fs/promises';

/** Envelope resolution; one value per frame. */
export const FRAME_MS = 10;
const WAV_HEADER_BYTES = 44;
const DB_FLOOR = -70;
/** Context added each side of a word so a short word still has a pattern to compare. */
const PAD_MS = 100;
const MIN_FRAMES = 12;
/** A window this flat has no loudness pattern to compare. */
const MIN_STD_DB = 3;
/** The meeting track must be audibly playing (peak in the window) to explain the mic. */
const MIN_MEETING_DB = -50;
/** Loudness range kept below a window's peak. */
const RANGE_DB = 30;
/** The mic hears the meeting this much later (room sound) or earlier (clock offset). */
const LAG_MIN_MS = -100;
const LAG_MAX_MS = 1000;
const LAG_SPREAD_MS = 60;
const MIN_LAG_WORDS = 5;
const MAX_LAG_WORDS = 300;
const MIN_LAG_CORR = 0.5;

export interface EchoLikeness {
  /** Pearson correlation of the two loudness patterns at the best lag. */
  corr: number;
  /** Spread (dB) of mic minus meeting loudness; a pure echo keeps it nearly constant. */
  spreadDb: number;
  /** Mean mic minus meeting loudness (dB): the room's gain if this is echo. */
  offsetDb: number;
  lagMs: number;
}

/** Loudness per FRAME_MS frame, in dB, from 16 kHz mono samples. */
export function envelopeOf(
  samples: ArrayLike<number>,
  rate = 16_000,
  scale = 1 / 32768,
): Float32Array {
  const per = Math.round((rate * FRAME_MS) / 1000);
  const out = new Float32Array(Math.floor(samples.length / per));
  for (let f = 0; f < out.length; f++) {
    let sum = 0;
    for (let i = f * per; i < (f + 1) * per; i++) {
      const v = samples[i]! * scale;
      sum += v * v;
    }
    out[f] = Math.max(DB_FLOOR, 10 * Math.log10(sum / per + 1e-12));
  }
  return out;
}

/** Envelope of a 16 kHz mono 16-bit WAV as written by the final pass; null for any other layout. */
export async function readWavEnvelope(path: string): Promise<Float32Array | null> {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(WAV_HEADER_BYTES);
    const { bytesRead } = await file.read(head, 0, WAV_HEADER_BYTES, 0);
    const ok =
      bytesRead === WAV_HEADER_BYTES &&
      head.toString('ascii', 0, 4) === 'RIFF' &&
      head.toString('ascii', 36, 40) === 'data' &&
      head.readUInt16LE(20) === 1 &&
      head.readUInt16LE(22) === 1 &&
      head.readUInt32LE(24) === 16_000 &&
      head.readUInt16LE(34) === 16;
    if (!ok) return null;
    const perFrame = 160;
    const chunkFrames = 6000;
    const out: number[] = [];
    const buf = Buffer.alloc(perFrame * 2 * chunkFrames);
    for (let pos = WAV_HEADER_BYTES; ; pos += buf.length) {
      const { bytesRead: n } = await file.read(buf, 0, buf.length, pos);
      const frames = Math.floor(n / (perFrame * 2));
      if (frames === 0) break;
      const samples = new Int16Array(buf.buffer, buf.byteOffset, frames * perFrame);
      for (const v of envelopeOf(samples)) out.push(v);
      if (n < buf.length) break;
    }
    return Float32Array.from(out);
  } finally {
    await file.close();
  }
}

interface Window {
  from: number;
  n: number;
}

function windowOf(startMs: number, endMs: number): Window {
  const from = Math.floor((startMs - PAD_MS) / FRAME_MS);
  const to = Math.ceil((Math.max(endMs, startMs) + PAD_MS) / FRAME_MS);
  return { from, n: to - from };
}

/** Compares the mic's loudness pattern over a window with the meeting's at one lag; null if unusable. */
function compare(
  mic: Float32Array,
  meeting: Float32Array,
  w: Window,
  lagFrames: number,
): { corr: number; spreadDb: number; offsetDb: number } | null {
  const m0 = w.from;
  const t0 = w.from - lagFrames;
  if (m0 < 0 || t0 < 0 || m0 + w.n > mic.length || t0 + w.n > meeting.length) return null;
  // Frames far below the window's peak are room noise, not speech; flatten them so a
  // different noise floor on each track does not decide the comparison.
  let pm = -Infinity;
  let pt = -Infinity;
  for (let i = 0; i < w.n; i++) {
    pm = Math.max(pm, mic[m0 + i]!);
    pt = Math.max(pt, meeting[t0 + i]!);
  }
  const fm = pm - RANGE_DB;
  const ft = pt - RANGE_DB;
  const a0 = (i: number): number => Math.max(fm, mic[m0 + i]!);
  const b0 = (i: number): number => Math.max(ft, meeting[t0 + i]!);
  let sm = 0;
  let st = 0;
  for (let i = 0; i < w.n; i++) {
    sm += a0(i);
    st += b0(i);
  }
  const am = sm / w.n;
  const at = st / w.n;
  if (pt < MIN_MEETING_DB) return null;
  let vm = 0;
  let vt = 0;
  let cov = 0;
  let vd = 0;
  for (let i = 0; i < w.n; i++) {
    const a = a0(i) - am;
    const b = b0(i) - at;
    vm += a * a;
    vt += b * b;
    cov += a * b;
    const d = a - b;
    vd += d * d;
  }
  const sdm = Math.sqrt(vm / w.n);
  const sdt = Math.sqrt(vt / w.n);
  if (sdm < MIN_STD_DB || sdt < MIN_STD_DB) return null;
  return { corr: cov / Math.sqrt(vm * vt), spreadDb: Math.sqrt(vd / w.n), offsetDb: am - at };
}

/** Best match of a word's mic loudness against the meeting track over lags in [fromMs, toMs]. */
export function echoLikeness(
  mic: Float32Array,
  meeting: Float32Array,
  startMs: number,
  endMs: number,
  fromMs = LAG_MIN_MS,
  toMs = LAG_MAX_MS,
): EchoLikeness | null {
  const w = windowOf(startMs, endMs);
  if (w.n < MIN_FRAMES) return null;
  let best: EchoLikeness | null = null;
  for (let lag = Math.ceil(fromMs / FRAME_MS); lag <= Math.floor(toMs / FRAME_MS); lag++) {
    const c = compare(mic, meeting, w, lag);
    if (c && (!best || c.corr > best.corr)) best = { ...c, lagMs: lag * FRAME_MS };
  }
  return best;
}

/**
 * The delay and level at which the mic follows the meeting, judged on words already known to be echo.
 * Null when those words' loudness does not follow the meeting (headset, no echo in this file),
 * which switches the envelope rule off.
 */
export function estimateLagMs(
  mic: Float32Array,
  meeting: Float32Array,
  known: { startMs: number; endMs: number }[],
): { lagMs: number; offsetDb: number } | null {
  if (known.length < MIN_LAG_WORDS) return null;
  const step = Math.max(1, Math.ceil(known.length / MAX_LAG_WORDS));
  const picked = known.filter((_, i) => i % step === 0);
  const wins = picked.map((k) => windowOf(k.startMs, k.endMs)).filter((w) => w.n >= MIN_FRAMES);
  let bestLag = 0;
  let bestMean = -Infinity;
  for (
    let lag = Math.ceil(LAG_MIN_MS / FRAME_MS);
    lag <= Math.floor(LAG_MAX_MS / FRAME_MS);
    lag++
  ) {
    let sum = 0;
    let used = 0;
    for (const w of wins) {
      const c = compare(mic, meeting, w, lag);
      if (c) {
        sum += c.corr;
        used++;
      }
    }
    if (used >= MIN_LAG_WORDS && sum / used > bestMean) {
      bestMean = sum / used;
      bestLag = lag * FRAME_MS;
    }
  }
  if (bestMean < MIN_LAG_CORR) return null;
  const offsets = wins
    .map((w) => compare(mic, meeting, w, bestLag / FRAME_MS))
    .filter((c) => c !== null && c.corr >= MIN_LAG_CORR)
    .map((c) => c!.offsetDb)
    .sort((a, b) => a - b);
  if (offsets.length < MIN_LAG_WORDS) return null;
  return { lagMs: bestLag, offsetDb: offsets[offsets.length >> 1]! };
}

export const lagRange = (lagMs: number): [number, number] => [
  lagMs - LAG_SPREAD_MS,
  lagMs + LAG_SPREAD_MS,
];

/** Edit distance, stopping early once it exceeds `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      row.push(v);
      if (v < low) low = v;
    }
    if (low > max) return false;
    prev = row;
  }
  return prev[b.length]! <= max;
}

/** Two spellings of what could be the same word heard slightly differently; short words must match exactly. */
export function similarWord(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length);
  if (n < 4) return false;
  return within(a, b, n >= 8 ? 2 : 1);
}
