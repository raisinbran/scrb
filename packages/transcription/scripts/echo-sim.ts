// Room-echo simulation on AMI: before/after for dropRoomEcho.  Run from packages/transcription:
//   npx tsx scripts/echo-sim.ts [meeting=ES2004a] [seed=1] [seconds=840]
// The meeting track is an AMI mix; the "user" is another AMI meeting (IS1009a) speaking in short
// windows over it.  The mic track is a delayed, room-smeared, attenuated copy of the meeting
// plus the user plus faint noise.  Mic words come from the AMI word annotations through an
// invented recogniser error model (see ERRORS).  No owner recordings are used.
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dropRoomEcho, type EchoAudio } from '../src/finalPass.js';
import { envelopeOf } from '../src/echoEnvelope.js';

// The rule as it was before this change (exact text only, no audio), kept for the comparison.
const ECHO_WINDOW_MS = 1000;
const ECHO_MIN_RUN = 2;
const TURN_GAP_MS = 1500;
const bare = (text: string): string => text.toLowerCase().replace(/[^a-z0-9']/g, '');

/**
 * Removes mic words that re-capture the meeting audio from the speakers: runs of at least
 * ECHO_MIN_RUN mic words, each at most TURN_GAP_MS after the previous, that match distinct
 * meeting words of the same text, within ECHO_WINDOW_MS, in the same order.  Not an echo
 * canceller; the user repeating a phrase at the same moment is lost.
 */
function original<W extends { text: string; startMs: number }>(
  mic: W[],
  meeting: { text: string; startMs: number }[],
): W[] {
  const heard = [...meeting].sort((a, b) => a.startMs - b.startMs);
  const own = [...mic].sort((a, b) => a.startMs - b.startMs);
  const heardText = heard.map((m) => bare(m.text));
  // First meeting word that starts inside the window; only the window is scanned after it.
  const firstInWindow = (from: number): number => {
    let lo = 0;
    let hi = heard.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (heard[mid]!.startMs < from) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const heardAfter = (w: W, after: number): number => {
    const text = bare(w.text);
    const k0 = Math.max(after + 1, firstInWindow(w.startMs - ECHO_WINDOW_MS));
    for (let k = k0; k < heard.length && heard[k]!.startMs <= w.startMs + ECHO_WINDOW_MS; k++) {
      if (heardText[k] === text) return k;
    }
    return -1;
  };
  const echo = new Set<W>();
  let run: W[] = [];
  let last = -1;
  const endRun = (): void => {
    if (run.length >= ECHO_MIN_RUN) for (const w of run) echo.add(w);
    run = [];
    last = -1;
  };
  for (const w of own) {
    if (run.length > 0 && w.startMs - run.at(-1)!.startMs > TURN_GAP_MS) endRun();
    if (!bare(w.text)) {
      endRun();
      continue;
    }
    let k = heardAfter(w, last);
    if (k < 0 && run.length > 0) {
      endRun();
      k = heardAfter(w, -1);
    }
    if (k < 0) continue;
    run.push(w);
    last = k;
  }
  endRun();
  return own.filter((w) => !echo.has(w));
}

const assets = process.env['SCRB_DEV_ASSETS'] ?? join(homedir(), 'scrb-dev-assets');
const ami = join(assets, 'downloads/ami');
const [meetingId = 'ES2004a', seedArg = '1', secArg = '840'] = process.argv.slice(2);
const SECONDS = Number(secArg);
const USER_MEETING = 'IS1009a';
/** Share of echoed meeting words the mic recogniser outputs as: same, near spelling, other word, nothing. */
const ERRORS = { exact: 0.72, near: 0.13, other: 0.07 };
const ECHO_DELAY_MS = 140;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2 ** 32;
  };
}
const gauss = (r: () => number): number =>
  Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

interface W {
  text: string;
  startMs: number;
  endMs: number;
}

function words(id: string, until: number): W[] {
  const dir = join(ami, 'ann/words');
  const out: W[] = [];
  for (const f of readdirSync(dir).filter((n) => n.startsWith(`${id}.`))) {
    const xml = readFileSync(join(dir, f), 'latin1');
    for (const m of xml.matchAll(
      /<w [^>]*starttime="([\d.]+)" endtime="([\d.]+)"([^>]*)>([^<]+)<\/w>/g,
    )) {
      if (m[3]!.includes('punc="true"')) continue;
      const startMs = Math.round(Number(m[1]) * 1000);
      if (startMs < until * 1000)
        out.push({ text: m[4]!, startMs, endMs: Math.round(Number(m[2]) * 1000) });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

function wav(id: string, seconds: number): Float32Array {
  const buf = readFileSync(join(ami, `${id}.Mix-Headset.wav`));
  const n = Math.min((buf.length - 44) >> 1, seconds * 16000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(44 + 2 * i) / 32768;
  return out;
}

const rms = (x: ArrayLike<number>, a: number, b: number): number => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
};

function run(echoDb: number, seed: number): Record<string, unknown> {
  const r = rng(seed);
  const meetingAudio = wav(meetingId, SECONDS);
  const userAudio = wav(USER_MEETING, SECONDS);
  const meetingWords = words(meetingId, SECONDS);
  const userWords = words(USER_MEETING, SECONDS);
  // User speaks in 8 s windows about every 40 s.
  const windows: [number, number][] = [];
  for (let t = 15 + r() * 10; t + 8 < SECONDS; t += 40 + r() * 10)
    windows.push([t * 1000, (t + 8) * 1000]);
  const inWindow = (ms: number): boolean =>
    windows.some(([a, b]) => ms >= a - 300 && ms <= b + 300);

  // Mic audio: sparse room response of the meeting, plus the user in the windows, plus faint noise.
  const n = meetingAudio.length;
  const taps = Array.from({ length: 14 }, (_, i) => ({
    d: Math.round((ECHO_DELAY_MS / 1000) * 16000 + (i === 0 ? 0 : r() * 0.09 * 16000)),
    g: (i === 0 ? 1 : (r() * 2 - 1) * Math.exp(-i / 5)) * 1,
  }));
  const echo = new Float32Array(n);
  for (const { d, g } of taps) for (let i = d; i < n; i++) echo[i]! += g * meetingAudio[i - d]!;
  const mic = new Float32Array(n);
  let userSum = 0;
  let userN = 0;
  for (const [a, b] of windows) {
    const i0 = Math.floor((a / 1000) * 16000);
    const i1 = Math.min(n, Math.floor((b / 1000) * 16000));
    userSum += rms(userAudio, i0, i1) ** 2 * (i1 - i0);
    userN += i1 - i0;
  }
  const userRms = Math.sqrt(userSum / userN);
  const echoGain = (userRms * 10 ** (echoDb / 20)) / rms(echo, 0, n);
  for (let i = 0; i < n; i++) mic[i] = echo[i]! * echoGain + gauss(r) * userRms * 0.003;
  for (const [a, b] of windows) {
    const i0 = Math.floor((a / 1000) * 16000);
    const i1 = Math.min(n, Math.floor((b / 1000) * 16000));
    for (let i = i0; i < i1; i++) mic[i]! += userAudio[i]!;
  }

  // Meeting transcript: 4% of words misrecognised.
  const vocab = [...new Set(meetingWords.map((w) => w.text.toLowerCase()))];
  const heardMeeting = meetingWords.map((w) =>
    r() < 0.04 ? { ...w, text: vocab[Math.floor(r() * vocab.length)]! } : w,
  );
  // Mic transcript: echo words (outside the user's windows) through the error model, plus user words.
  const near = (t: string): string => (t.length > 3 && r() < 0.5 ? t.slice(0, -1) : `${t}s`);
  const micWords: (W & { kind: 'echo' | 'user' })[] = [];
  for (const w of meetingWords) {
    if (inWindow(w.startMs)) continue;
    const x = r();
    if (x >= ERRORS.exact + ERRORS.near + ERRORS.other) continue;
    const text =
      x < ERRORS.exact
        ? w.text
        : x < ERRORS.exact + ERRORS.near
          ? near(w.text)
          : vocab[Math.floor(r() * vocab.length)]!;
    const j = ECHO_DELAY_MS + gauss(r) * 50;
    micWords.push({
      text,
      startMs: Math.round(w.startMs + j),
      endMs: Math.round(w.endMs + j),
      kind: 'echo',
    });
  }
  for (const w of userWords) {
    if (!windows.some(([a, b]) => w.startMs >= a && w.endMs <= b)) continue;
    const j = gauss(r) * 40;
    micWords.push({
      ...w,
      startMs: Math.round(w.startMs + j),
      endMs: Math.round(w.endMs + j),
      kind: 'user',
    });
  }
  micWords.sort((a, b) => a.startMs - b.startMs);

  const audio: EchoAudio = {
    mic: envelopeOf(mic, 16_000, 1),
    meeting: envelopeOf(meetingAudio, 16_000, 1),
  };
  const overlaps = (w: W): boolean =>
    meetingWords.some((m) => m.startMs < w.endMs && m.endMs > w.startMs);
  const score = (kept: typeof micWords): Record<string, number> => {
    const keep = new Set(kept);
    const echoWords = micWords.filter((w) => w.kind === 'echo');
    const userOnly = micWords.filter((w) => w.kind === 'user');
    const over = userOnly.filter(overlaps);
    return {
      echoWords: echoWords.length,
      echoDroppedPct: +(
        (100 * echoWords.filter((w) => !keep.has(w)).length) /
        echoWords.length
      ).toFixed(1),
      userWords: userOnly.length,
      userDropped: userOnly.filter((w) => !keep.has(w)).length,
      userOverlappingMeeting: over.length,
      userOverlappingDropped: over.filter((w) => !keep.has(w)).length,
    };
  };
  return {
    meeting: meetingId,
    seed,
    echoVsUserDb: echoDb,
    before: score(original(micWords, heardMeeting)),
    fuzzyOnly: score(dropRoomEcho(micWords, heardMeeting)),
    after: score(dropRoomEcho(micWords, heardMeeting, audio)),
  };
}

for (const db of [-12, -6, 0]) console.log(JSON.stringify(run(db, Number(seedArg))));
