/**
 * Offline evaluation of LiveEchoFilter on AMI word timings (no audio, no whisper):
 * node_modules/.bin/tsx packages/transcription/scripts/eval-live-echo.ts <AMI words dir> [seed]
 * Meeting track = one AMI speaker; mic = a delayed, imperfectly recognised copy of it plus a
 * second AMI speaker as the independent "user".  Segment arrival is lagged independently per track.
 */
import { readFileSync } from 'node:fs';
import { dropRoomEcho } from '../src/finalPass.js';
import { LiveEchoFilter } from '../src/liveEcho.js';
import type { TimedLiveSegment } from '../src/livePcmEngine.js';

const dir = process.argv[2]!;
let s = Number(process.argv[3] ?? 1) >>> 0;
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
interface W {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  kind?: 'echo' | 'user';
}

function load(meeting: string, who: string): W[] {
  const xml = readFileSync(`${dir}/${meeting}.${who}.words.xml`, 'latin1');
  const out: W[] = [];
  for (const m of xml.matchAll(
    /<w [^>]*starttime="([\d.]+)" endtime="([\d.]+)"([^>]*)>([^<]*)<\/w>/g,
  )) {
    if (m[3]!.includes('punc')) continue;
    out.push({
      text: m[4]!.replace(/&#39;/g, "'"),
      startMs: Math.round(+m[1]! * 1000),
      endMs: Math.round(+m[2]! * 1000),
      confidence: 0.9,
    });
  }
  return out;
}

function segments(track: 'mic' | 'meeting', words: W[], lag: () => number) {
  const out: { seg: TimedLiveSegment; at: number }[] = [];
  let cur: W[] = [];
  const close = () => {
    if (!cur.length) return;
    const first = cur[0]!,
      last = cur.at(-1)!;
    out.push({
      at: last.endMs + lag(),
      seg: {
        id: `${track}-${out.length}`,
        track,
        sequence: 1,
        startMs: first.startMs,
        endMs: last.endMs,
        text: cur.map((w) => w.text).join(' '),
        words: cur,
        speakerId: track,
        speakerLabel: track,
        provisional: true,
      },
    });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && (w.startMs - cur.at(-1)!.endMs > 300 || w.endMs - cur[0]!.startMs > 4000))
      close();
    cur.push(w);
  }
  close();
  return out;
}

function run(
  meetingId: string,
  remote: string,
  user: string,
  lagLo: number,
  lagHi: number,
  windowMs: number,
) {
  const A = load(meetingId, remote).filter((w) => w.endMs < windowMs);
  const B = load(meetingId, user)
    .filter((w) => w.endMs < windowMs)
    .map((w) => ({ ...w, kind: 'user' as const }));
  const delay = 40 + rnd() * 360;
  const echo: W[] = [];
  for (const w of A) {
    if (rnd() < 0.15) continue; // not recognised in the mic
    const text = rnd() < 0.1 ? 'zzz' + Math.floor(rnd() * 50) : w.text;
    echo.push({
      ...w,
      text,
      startMs: Math.round(w.startMs + delay),
      endMs: Math.round(w.endMs + delay),
      kind: 'echo',
    });
  }
  const mic = [...echo, ...B].sort((a, b) => a.startMs - b.startMs);
  // Whisper words in one segment must not overlap; shift ties minimally.
  let prev = 0;
  for (const w of mic) {
    w.startMs = Math.max(w.startMs, prev);
    w.endMs = Math.max(w.endMs, w.startMs);
    prev = w.endMs;
  }
  const lag = () => lagLo + rnd() * (lagHi - lagLo);
  const events = [...segments('meeting', A, lag), ...segments('mic', mic, lag)].sort(
    (a, b) => a.at - b.at,
  );
  let now = 0;
  const kept = new Set<W>();
  const delays: number[] = [];
  const arrival = new Map<string, number>();
  const timers: { at: number; fn: () => void }[] = [];
  const f = new LiveEchoFilter(
    (seg) => {
      if (seg.track === 'mic') {
        for (const w of seg.words) kept.add(w as W);
        delays.push(now - arrival.get('mic' + seg.id.replace(/-tail$/, ''))!);
      }
    },
    {
      holdMs: Number(process.env.HOLD_MS ?? 2000),
      now: () => now,
      setTimer: (fn, ms) => {
        const t = { at: now + ms, fn };
        timers.push(t);
        return t;
      },
      clearTimer: (t) => timers.splice(timers.indexOf(t as never), 1),
    },
  );
  const tick = (to: number) => {
    for (;;) {
      const t = timers.filter((x) => x.at <= to).sort((a, b) => a.at - b.at)[0];
      if (!t) break;
      timers.splice(timers.indexOf(t), 1);
      now = t.at;
      t.fn();
    }
    now = to;
  };
  for (const e of events) {
    tick(e.at);
    arrival.set(e.seg.track === 'mic' ? 'mic' + e.seg.id : 'x', e.at);
    f.push(e.seg);
  }
  tick(now + 10_000);
  f.flush();
  const c = (k: string) => mic.filter((w) => w.kind === k);
  const echoShown = c('echo').filter((w) => kept.has(w)).length;
  const userDropped = c('user').filter((w) => !kept.has(w)).length;
  const off = new Set(dropRoomEcho(mic, A));
  const offlineShown = c('echo').filter((w) => off.has(w)).length;
  return {
    offlineShown,
    echo: c('echo').length,
    echoShown,
    user: c('user').length,
    userDropped,
    delays,
  };
}

const cases: [string, string, string][] = [
  ['ES2002a', 'A', 'B'],
  ['ES2002b', 'A', 'C'],
  ['ES2002c', 'B', 'D'],
  ['EN2001a', 'A', 'B'],
  ['EN2001b', 'C', 'E'],
  ['TS3003a', 'A', 'B'],
];
for (const [lo, hi] of [
  [1000, 3000],
  [0, 500],
  [0, 4000],
] as const) {
  let off = 0,
    e = 0,
    es = 0,
    u = 0,
    ud = 0;
  const d: number[] = [];
  for (const [m, a, b] of cases) {
    try {
      const r = run(m, a, b, lo, hi, 20 * 60_000);
      off += r.offlineShown;
      e += r.echo;
      es += r.echoShown;
      u += r.user;
      ud += r.userDropped;
      d.push(...r.delays);
    } catch {
      /* fixture missing */
    }
  }
  d.sort((x, y) => x - y);
  const p = (q: number) => Math.round(d[Math.floor(q * (d.length - 1))] ?? 0);
  console.log(
    `lag ${lo}-${hi} ms: echo words ${e}, still shown ${es} (${((100 * (e - es)) / e).toFixed(1)}% suppressed); user words ${u}, wrongly dropped ${ud}; offline-equivalent suppressed ${((100 * (e - off)) / e).toFixed(1)}%; extra display delay mic segments mean ${Math.round(d.reduce((x, y) => x + y, 0) / d.length)} ms, p50 ${p(0.5)}, p95 ${p(0.95)}, max ${p(1)}`,
  );
}
