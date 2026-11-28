// V-b1 synthetic run: public AMI clips + invented deterministic room echoes (never owner audio).
// Usage: npx tsx scripts/research/noise-filter-synthetic.mts <assets> <apm-filter exe> <out.json>
// Fixtures are only read; every mic/meeting/filtered file is a disposable copy under the OS temp dir.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filterMicCopy } from '../../packages/transcription/src/noiseFilter.ts';
import {
  TARGETS,
  encodeWav,
  leakageReduction,
  parseWav,
  roomEcho,
  scoreWer,
} from '../noise-bleed-metrics.mjs';

export const ECHO_DELAYS_MS = [40, 120, 250, 400];
/** Remote speech on the mic was about 8 dB louder than local speech in the Mac Teams capture. */
export const NEAR_BELOW_ECHO_DB = 8;
const RATE = 16_000;

export const rmsDb = (x: Float32Array): number =>
  20 * Math.log10(Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length) + 1e-12);

export function clip(
  wavPath: string,
  fromS: number,
  toS: number,
): { rate: number; x: Float32Array } {
  const { rate, samples } = parseWav(readFileSync(wavPath));
  return { rate, x: samples.slice(Math.round(fromS * rate), Math.round(toS * rate)) };
}

export function mixNearEnd(echo: Float32Array, near: Float32Array, belowDb: number): Float32Array {
  const g = 10 ** ((rmsDb(echo) - belowDb - rmsDb(near)) / 20);
  const out = Float32Array.from(echo);
  for (let i = 0; i < out.length && i < near.length; i++) out[i] += g * near[i];
  return out;
}

const scale = (x: Float32Array, db: number): Float32Array => x.map((v) => v * 10 ** (db / 20));

interface Cond {
  name: string;
  micFor: (far: Float32Array, near: Float32Array) => Float32Array;
}

const WER_CONDITIONS: Cond[] = [
  { name: 'near-end-only normal', micFor: (_f, n) => n },
  { name: 'near-end-only quiet (-14 dB)', micFor: (_f, n) => scale(n, -14) },
  {
    name: 'double talk 120 ms echo',
    micFor: (f, n) => mixNearEnd(roomEcho(f, RATE, 120), n, NEAR_BELOW_ECHO_DB),
  },
  {
    name: 'double talk 400 ms echo',
    micFor: (f, n) => mixNearEnd(roomEcho(f, RATE, 400), n, NEAR_BELOW_ECHO_DB),
  },
];

/** Near-end windows: AMI IS1009a speaker A, picked from annotations for at least 90% own words. */
const NEAR_WINDOWS = [
  { from: 110, to: 140, farFrom: 120 },
  { from: 430, to: 460, farFrom: 300 },
];

const LEAK_CLIPS = [
  {
    name: 'tuned ES2004a 120-180 s',
    file: 'ES2004a.Mix-Headset.wav',
    from: 120,
    to: 180,
    heldOut: false,
  },
  {
    name: 'held-out ES2004a 600-660 s',
    file: 'ES2004a.Mix-Headset.wav',
    from: 600,
    to: 660,
    heldOut: true,
  },
  {
    name: 'held-out TS3003a 200-260 s',
    file: 'TS3003a.Mix-Headset.wav',
    from: 200,
    to: 260,
    heldOut: true,
  },
];

const norm = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

function refWordsOf(ann: string, from: number, to: number): string[] {
  const t = readFileSync(join(ann, 'words', 'IS1009a.A.words.xml'), 'latin1');
  const out: { at: number; w: string }[] = [];
  for (const m of t.matchAll(/<w [^>]*starttime="([\d.]+)"[^>]*>([^<]*)<\/w>/g)) {
    if (m[0].includes('punc="true"')) continue;
    const at = Number(m[1]);
    if (at >= from && at < to) out.push({ at, w: m[2]!.toLowerCase().replace(/[^a-z0-9']/g, '') });
  }
  return out
    .sort((a, b) => a.at - b.at)
    .map((x) => x.w)
    .filter(Boolean);
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

function whisperText(whisper: string, model: string, wavPath: string, outBase: string): string {
  execFileSync(
    whisper,
    ['-m', model, '-f', wavPath, '-nt', '-otxt', '-of', outBase, '-t', '4', '-l', 'en'],
    { stdio: 'ignore' },
  );
  return readFileSync(outBase + '.txt', 'utf8');
}

async function main(): Promise<void> {
  const [assets, helper, outJson] = process.argv.slice(2);
  if (!assets || !helper || !outJson)
    throw new Error('usage: <assets> <apm-filter exe> <out.json>');
  const whisper = join(assets, 'upstream/whisper.cpp/build/bin/whisper-cli.exe');
  const model = join(assets, 'models/whisper/ggml-small.en-q5_1.bin');
  const ami = join(assets, 'downloads', 'ami');
  const ann = join(ami, 'ann');
  const work = mkdtempSync(join(tmpdir(), 'scrb-vb1-'));
  const mode = process.env['SCRB_VB1_MODE'] ?? 'default';
  const settings = {
    noiseSuppression: mode === 'aec-only' ? 'off' : 'moderate',
    echoCancellation: mode !== 'ns-only',
    autoGain: false,
  } as const;

  const run = async (dir: string, mic: Float32Array, ref: Float32Array) => {
    mkdirSync(dir, { recursive: true });
    const micWav = join(dir, 'mic.wav');
    const meetingWav = join(dir, 'meeting.wav');
    writeFileSync(micWav, encodeWav(mic, RATE));
    writeFileSync(meetingWav, encodeWav(ref, RATE));
    const t0 = Date.now();
    const r = await filterMicCopy({
      helperPath: helper,
      micWav,
      meetingWav,
      workDir: dir,
      settings,
    });
    if (r.kind !== 'filtered') throw new Error(`bypassed: ${r.reason}`);
    return {
      micWav,
      filteredWav: r.wavPath,
      ms: Date.now() - t0,
      filtered: parseWav(readFileSync(r.wavPath)).samples as Float32Array,
    };
  };

  const leakage: Record<string, unknown>[] = [];
  const all: { heldOut: boolean; pooledDb: number; medianDb: number }[] = [];
  for (const c of process.env['SCRB_VB1_SKIP_LEAK'] ? [] : LEAK_CLIPS) {
    const far = clip(join(ami, c.file), c.from, c.to);
    for (const d of ECHO_DELAYS_MS) {
      const echo = roomEcho(far.x, RATE, d);
      const o = await run(join(work, `leak-${leakage.length}`), echo, far.x);
      const lk = leakageReduction(echo, o.filtered, far.x, RATE, { echoDelayMs: d });
      all.push({ heldOut: c.heldOut, pooledDb: lk.pooledDb, medianDb: lk.medianDb });
      leakage.push({
        clip: c.name,
        delayMs: d,
        frames: lk.frames,
        medianDb: +lk.medianDb.toFixed(1),
        pooledDb: +lk.pooledDb.toFixed(1),
        processSeconds: +(o.ms / 1000).toFixed(2),
        pooledAtLeast8: lk.pooledDb >= TARGETS.perConditionDb,
      });
    }
  }

  const wer: Record<string, unknown>[] = [];
  for (const c of WER_CONDITIONS) {
    let refWords = 0;
    let errU = 0;
    let errF = 0;
    let edgeU = 0;
    let edgeF = 0;
    let edgeTotal = 0;
    for (const [i, w] of NEAR_WINDOWS.entries()) {
      const near = clip(join(ami, 'IS1009a.Mix-Headset.wav'), w.from, w.to);
      const far = clip(
        join(ami, 'ES2004a.Mix-Headset.wav'),
        w.farFrom,
        w.farFrom + (w.to - w.from),
      );
      const dir = join(work, `wer-${c.name.replace(/\W+/g, '_')}-${i}`);
      const o = await run(dir, c.micFor(far.x, near.x), far.x);
      const hu = whisperText(whisper, model, o.micWav, join(dir, 'hyp-unfiltered'));
      const hf = whisperText(whisper, model, o.filteredWav, join(dir, 'hyp-filtered'));
      const opt = { speaker: 'A', from: w.from, to: w.to, python: 'python' };
      const su = scoreWer(ann, 'IS1009a', join(dir, 'hyp-unfiltered.txt'), opt);
      const sf = scoreWer(ann, 'IS1009a', join(dir, 'hyp-filtered.txt'), opt);
      if (su.ref_words !== sf.ref_words || su.ref_words < 20)
        throw new Error('invalid denominators');
      refWords += su.ref_words;
      errU += Math.round(su.wer * su.ref_words);
      errF += Math.round(sf.wer * sf.ref_words);
      const refW = refWordsOf(ann, w.from, w.to);
      const has = (hyp: string[], words: string[]): number =>
        words.filter((x) => hyp.includes(x)).length;
      const head = refW.slice(0, 3);
      const tail = refW.slice(-3);
      edgeTotal += head.length + tail.length;
      edgeU += has(norm(hu).slice(0, 8), head) + has(norm(hu).slice(-8), tail);
      edgeF += has(norm(hf).slice(0, 8), head) + has(norm(hf).slice(-8), tail);
    }
    wer.push({
      condition: c.name,
      refWords,
      errorsUnfiltered: errU,
      errorsFiltered: errF,
      werUnfiltered: +(errU / refWords).toFixed(4),
      werFiltered: +(errF / refWords).toFixed(4),
      noWorse: errF <= errU,
      edgeWordsOf: edgeTotal,
      edgeKeptUnfiltered: edgeU,
      edgeKeptFiltered: edgeF,
    });
  }

  const held = all.filter((t) => t.heldOut);
  const summary = {
    note: 'Synthetic only: invented echoes and AMI audio; no speakers, no live path.',
    targets: TARGETS,
    leakage,
    heldOut: {
      medianOfConditionMediansDb: +median(held.map((t) => t.medianDb)).toFixed(1),
      minPooledDb: +Math.min(...held.map((t) => t.pooledDb)).toFixed(1),
    },
    allConditionsPooledAtLeast8:
      all.length > 0 && all.every((t) => t.pooledDb >= TARGETS.perConditionDb),
    wer,
  };
  writeFileSync(outJson, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) await main();
