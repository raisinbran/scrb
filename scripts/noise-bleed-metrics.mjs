// V-b0 metric harness for the recognition-copy noise/echo filter (plan: docs/plans/noise-filter-plan-20261125.md).
// Dev tooling only: no runtime code imports it. Reads WAVs, never writes next to them.
// Usage: node scripts/noise-bleed-metrics.mjs <config.json>   (see docs/research/noise-bleed-harness.md)
// Verdict PASS / FAIL / NOT_VERIFIED exits 0 / 1 / 2. Use public AMI audio and invented echoes only.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = { medianDb: 12, perConditionDb: 8, latencyP95Ms: 30 };
const FRAME_MS = 20;
const SCORER = join(dirname(fileURLToPath(import.meta.url)), 'eval', 'score_ami_wer.py');

/** Mono 16-bit PCM WAV (or the first channel) to { rate, samples: Float32Array in [-1, 1) }. */
export function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not a RIFF/WAVE file');
  let fmt = null;
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ')
      fmt = {
        tag: buf.readUInt16LE(body),
        ch: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    else if (id === 'data') {
      if (!fmt || fmt.tag !== 1 || fmt.bits !== 16)
        throw new Error('only 16-bit PCM WAV is supported');
      const end = Math.min(body + size, buf.length);
      const n = Math.floor((end - body) / (2 * fmt.ch));
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(body + i * 2 * fmt.ch) / 32768;
      return { rate: fmt.rate, samples };
    }
    at = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

export function encodeWav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

/** Deterministic invented room echo: decaying taps from `delayMs` out to `delayMs * 1.5`, no randomness. */
export function roomEcho(reference, rate, delayMs, gain = 0.5, taps = 4) {
  const out = new Float32Array(reference.length);
  for (let t = 0; t < taps; t++) {
    const lag = Math.round(((delayMs * (1 + (0.5 * t) / Math.max(taps - 1, 1))) / 1000) * rate);
    const g = gain * 0.6 ** t;
    for (let i = lag; i < out.length; i++) out[i] += g * reference[i - lag];
  }
  return out;
}

const energy = (x, from, to) => {
  let e = 0;
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return e;
};
const median = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export const percentile = (v, p) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN;
};

/**
 * Remote-voice leakage reduction in dB over far-end-active frames (reference RMS >= activeRms):
 * 10*log10(E_unfiltered / E_filtered) per frame, then the median and the pooled value.
 * `mask` (optional [{from,to}] seconds) restricts frames, e.g. to far-end-only windows.
 */
export function leakageReduction(
  unfiltered,
  filtered,
  reference,
  rate,
  { activeRms = 0.005, mask } = {},
) {
  const hop = Math.round((rate * FRAME_MS) / 1000);
  const n = Math.min(unfiltered.length, filtered.length, reference.length);
  const frames = [];
  let eu = 0,
    ef = 0;
  for (let at = 0; at + hop <= n; at += hop) {
    if (mask && !mask.some((m) => at / rate >= m.from && (at + hop) / rate <= m.to)) continue;
    if (Math.sqrt(energy(reference, at, at + hop) / hop) < activeRms) continue;
    const u = energy(unfiltered, at, at + hop) + 1e-12;
    const f = energy(filtered, at, at + hop) + 1e-12;
    frames.push(10 * Math.log10(u / f));
    eu += u;
    ef += f;
  }
  if (!frames.length) return { frames: 0, medianDb: NaN, pooledDb: NaN };
  return { frames: frames.length, medianDb: median(frames), pooledDb: 10 * Math.log10(eu / ef) };
}

/** Added latency (ms): lag of the filtered copy against the unfiltered one, by cross-correlation over the loudest segment. */
export function addedLatencyMs(unfiltered, filtered, rate, { maxMs = 100, segmentS = 1 } = {}) {
  const seg = Math.round(segmentS * rate);
  const maxLag = Math.round((maxMs / 1000) * rate);
  const n = Math.min(unfiltered.length, filtered.length);
  if (n < seg + maxLag) return NaN;
  let best = 0,
    bestE = -1;
  const step = Math.round(rate / 4);
  for (let at = 0; at + seg + maxLag <= n; at += step) {
    const e = energy(unfiltered, at, at + seg);
    if (e > bestE) {
      bestE = e;
      best = at;
    }
  }
  let bestLag = 0,
    bestC = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < seg; i++) c += unfiltered[best + i] * filtered[best + i + lag];
    if (c > bestC) {
      bestC = c;
      bestLag = lag;
    }
  }
  return (bestLag / rate) * 1000;
}

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Hash every file under `paths` (files or folders, recursive) so originals can be re-verified later. */
export function snapshot(paths) {
  const out = {};
  const walk = (p) => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) walk(join(p, f));
    else out[resolve(p)] = sha256(p);
  };
  paths.forEach(walk);
  return out;
}

/** Raw-data invariants: originals byte-identical, none of the filtered outputs is an original or lives beside one. */
export function verifyInvariants(before, filteredPaths = []) {
  const problems = [];
  const after = snapshot(Object.keys(before));
  for (const [p, h] of Object.entries(before))
    if (after[p] !== h) problems.push(`original changed: ${p}`);
  const dirs = new Set(Object.keys(before).map(dirname));
  for (const f of filteredPaths.map((p) => resolve(p))) {
    if (f in before) problems.push(`filtered output is an original: ${f}`);
    else if (dirs.has(dirname(f)))
      problems.push(`filtered output sits in an originals folder: ${f}`);
  }
  return { ok: problems.length === 0, problems };
}

/** Run the existing scorer on hypothesis files; returns wer per file name. Needs `python3` and AMI annotations. */
export function scoreWer(annotationDir, meeting, hypPaths, python = 'python3') {
  const out = execFileSync(python, ['-I', SCORER, annotationDir, meeting, ...hypPaths], {
    encoding: 'utf8',
  });
  return Object.fromEntries(
    out
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .map((r, i) => [hypPaths[i], r]),
  );
}

/** Evaluate one config (see docs/research/noise-bleed-harness.md) against the plan's targets. */
export function evaluate(config, { wer = scoreWer } = {}) {
  const base = config.baseDir ?? '.';
  const at = (p) => resolve(base, p);
  const before = snapshot((config.originals ?? []).map(at));
  const conditions = [];
  const notes = [];
  for (const c of config.conditions) {
    const u = parseWav(readFileSync(at(c.unfiltered)));
    const f = parseWav(readFileSync(at(c.filtered)));
    const r = parseWav(readFileSync(at(c.reference)));
    if (u.rate !== f.rate || u.rate !== r.rate) throw new Error(`${c.name}: sample rates differ`);
    const row = { name: c.name, farEndOnly: !!c.farEndOnly };
    if (c.leakage !== false) {
      row.leakage = leakageReduction(u.samples, f.samples, r.samples, u.rate, { mask: c.mask });
      row.latencyMs = addedLatencyMs(u.samples, f.samples, u.rate);
    }
    if (c.hypUnfiltered && c.hypFiltered) {
      const s = wer(at(config.annotationDir), c.meeting, [at(c.hypUnfiltered), at(c.hypFiltered)]);
      const [a, b] = [s[at(c.hypUnfiltered)], s[at(c.hypFiltered)]];
      row.wer = { unfiltered: a.wer, filtered: b.wer, refWords: a.ref_words, worse: b.wer > a.wer };
    }
    conditions.push(row);
  }
  const inv = verifyInvariants(
    before,
    config.conditions.map((c) => at(c.filtered)),
  );
  const fe = conditions.filter((c) => c.farEndOnly && c.leakage);
  const medianDb = median(fe.map((c) => c.leakage.medianDb));
  const leaky = conditions
    .filter((c) => c.leakage && !(c.leakage.pooledDb >= TARGETS.perConditionDb))
    .map((c) => c.name);
  const lat = percentile(
    conditions.map((c) => c.latencyMs).filter((v) => !Number.isNaN(v)),
    0.95,
  );
  const werWorse = conditions.filter((c) => c.wer?.worse).map((c) => c.name);
  const checks = {
    medianLeakage: fe.length ? medianDb >= TARGETS.medianDb : null,
    perConditionLeakage: conditions.some((c) => c.leakage) ? leaky.length === 0 : null,
    latencyP95: Number.isNaN(lat) ? null : lat < TARGETS.latencyP95Ms,
    nearEndWer: conditions.some((c) => c.wer) ? werWorse.length === 0 : null,
    invariants: (config.originals ?? []).length ? inv.ok : null,
  };
  for (const [k, v] of Object.entries(checks)) if (v === null) notes.push(`${k} not measured`);
  const verdict = Object.values(checks).includes(false)
    ? 'FAIL'
    : notes.length
      ? 'NOT_VERIFIED'
      : 'PASS';
  return {
    verdict,
    targets: TARGETS,
    medianFarEndDb: medianDb,
    latencyP95Ms: lat,
    conditions,
    checks,
    problems: inv.problems,
    leaky,
    werWorse,
    notes,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/noise-bleed-metrics.mjs <config.json>');
    process.exit(2);
  }
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.baseDir ??= dirname(resolve(file));
  const result = evaluate(config);
  console.log(JSON.stringify(result, null, 2));
  process.exit({ PASS: 0, FAIL: 1, NOT_VERIFIED: 2 }[result.verdict]);
}
