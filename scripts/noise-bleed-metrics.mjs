// V-b0 metric harness for the recognition-copy noise/echo filter (plan: docs/plans/noise-filter-plan-20261125.md).
// Dev tooling only: no runtime code imports it. Reads WAVs, never writes next to them.
// Usage: node scripts/noise-bleed-metrics.mjs manifest <out.json> <protected-path>...   (BEFORE any filtering)
//        node scripts/noise-bleed-metrics.mjs <config.json>   (see docs/research/noise-bleed-harness.md)
// Verdict PASS / FAIL / NOT_VERIFIED exits 0 / 1 / 2. Use public AMI audio and invented echoes only.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = { medianDb: 12, perConditionDb: 8, latencyP95Ms: 30 };
const MIN_LIVE_SAMPLES = 20;
const MIN_CORRELATION = 0.5;
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
const rmsOf = (x) => Math.sqrt(energy(x, 0, x.length) / Math.max(x.length, 1));
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
 * Leakage reduction in dB over far-end-active frames (reference RMS >= activeRms, reference shifted by
 * `echoDelayMs` so frames line up with the echo). Only meaningful where the mic holds remote voice alone:
 * pass far-end-only windows in `mask`. In double talk, local-speech attenuation would count as "echo reduction".
 */
export function leakageReduction(
  unfiltered,
  filtered,
  reference,
  rate,
  { activeRms = 0.005, mask, echoDelayMs = 0 } = {},
) {
  const hop = Math.round((rate * FRAME_MS) / 1000);
  const shift = Math.round((echoDelayMs / 1000) * rate);
  const n = Math.min(unfiltered.length, filtered.length, reference.length + shift);
  const frames = [];
  let eu = 0,
    ef = 0;
  for (let at = 0; at + hop <= n; at += hop) {
    if (mask && !mask.some((m) => at / rate >= m.from && (at + hop) / rate <= m.to)) continue;
    const rf = at - shift;
    if (rf < 0 || Math.sqrt(energy(reference, rf, rf + hop) / hop) < activeRms) continue;
    const u = energy(unfiltered, at, at + hop) + 1e-12;
    const f = energy(filtered, at, at + hop) + 1e-12;
    frames.push(10 * Math.log10(u / f));
    eu += u;
    ef += f;
  }
  if (!frames.length) return { frames: 0, medianDb: NaN, pooledDb: NaN };
  return { frames: frames.length, medianDb: median(frames), pooledDb: 10 * Math.log10(eu / ef) };
}

const SILENT_RMS = 1e-5;

/**
 * Offline alignment lag (ms) of the filtered copy against the unfiltered one: normalised cross-correlation over the
 * loudest segment, searching -maxMs..+maxMs. status is "ok" or an invalid reason; an invalid result is never a pass.
 * This is one waveform alignment, not live latency (see liveLatencySamplesMs).
 */
export function alignmentLag(unfiltered, filtered, rate, { maxMs = 100, segmentS = 1 } = {}) {
  const seg = Math.round(segmentS * rate);
  const maxLag = Math.round((maxMs / 1000) * rate);
  const n = Math.min(unfiltered.length, filtered.length);
  const bad = (status) => ({ ms: NaN, correlation: NaN, status });
  if (n < seg + 2 * maxLag) return bad('too short for the lag search');
  if (rmsOf(unfiltered) < SILENT_RMS) return bad('unfiltered signal is silent');
  if (rmsOf(filtered) < SILENT_RMS) return bad('filtered signal is silent');
  let best = maxLag,
    bestE = -1;
  const step = Math.round(rate / 4);
  for (let at = maxLag; at + seg + maxLag <= n; at += step) {
    const e = energy(unfiltered, at, at + seg);
    if (e > bestE) {
      bestE = e;
      best = at;
    }
  }
  if (bestE < seg * SILENT_RMS ** 2) return bad('loudest segment is silent');
  const corr = new Float64Array(2 * maxLag + 1);
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let c = 0,
      ef = 0;
    for (let i = 0; i < seg; i++) {
      const f = filtered[best + i + lag];
      c += unfiltered[best + i] * f;
      ef += f * f;
    }
    corr[lag + maxLag] = ef > 0 ? c / Math.sqrt(bestE * ef) : 0;
  }
  let pk = 0;
  for (let i = 1; i < corr.length; i++) if (corr[i] > corr[pk]) pk = i;
  const lag = pk - maxLag;
  if (corr[pk] < MIN_CORRELATION) return bad(`weak correlation (${corr[pk].toFixed(2)})`);
  if (pk === 0 || pk === corr.length - 1) return bad('lag at search boundary');
  const guard = Math.round(rate / 1000);
  for (let i = 0; i < corr.length; i++)
    if (Math.abs(i - pk) > guard && corr[i] >= 0.95 * corr[pk])
      return bad('ambiguous correlation peaks');
  return { ms: (lag / rate) * 1000, correlation: corr[pk], status: 'ok' };
}

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * Inventory of protected roots (files or folders): realpath, every file's size, SHA-256 and device:inode, symlinks recorded
 * as links (never followed). Take it BEFORE any filtering runs; compare afterwards with compareManifest.
 */
export function createManifest(roots, now = Date.now()) {
  const real = roots.map((r) => realpathSync(r));
  const entries = {};
  const walk = (p) => {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) entries[p] = { type: 'symlink', target: readlinkSync(p) };
    else if (st.isDirectory()) {
      entries[p] = { type: 'dir' };
      for (const f of readdirSync(p).sort()) walk(join(p, f));
    } else
      entries[p] = { type: 'file', size: st.size, sha256: sha256(p), id: `${st.dev}:${st.ino}` };
  };
  real.forEach(walk);
  return { version: 1, createdAtMs: now, roots: real, entries };
}

const same = (a, b) =>
  a &&
  b &&
  a.type === b.type &&
  a.sha256 === b.sha256 &&
  a.size === b.size &&
  a.target === b.target;

/** Full inventory comparison: added, modified, deleted paths (empty arrays mean untouched). */
export function compareManifest(manifest) {
  const now = createManifest(manifest.roots.filter((r) => existsSync(r) || lstatExists(r))).entries;
  const added = Object.keys(now).filter((p) => !(p in manifest.entries));
  const deleted = Object.keys(manifest.entries).filter((p) => !(p in now));
  const modified = Object.keys(manifest.entries).filter(
    (p) => p in now && !same(manifest.entries[p], now[p]),
  );
  return { added, modified, deleted, ok: !added.length && !modified.length && !deleted.length };
}
function lstatExists(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

const inside = (child, root) => child === root || child.startsWith(root + sep);

/** Each filtered output must be a plain single-link file outside every protected root, not an alias of a protected file, and newer than the manifest. */
export function checkOutputs(manifest, outputs) {
  const problems = [];
  const ids = new Set(
    Object.values(manifest.entries)
      .map((e) => e.id)
      .filter(Boolean),
  );
  for (const out of outputs.map((o) => resolve(o))) {
    let st;
    try {
      st = lstatSync(out);
    } catch {
      problems.push(`filtered output missing: ${out}`);
      continue;
    }
    if (st.isSymbolicLink()) problems.push(`filtered output is a symlink: ${out}`);
    else if (!st.isFile()) problems.push(`filtered output is not a file: ${out}`);
    const real = realpathSync(out);
    if (manifest.roots.some((r) => inside(real, r) || inside(realpathSync(dirname(out)), r)))
      problems.push(`filtered output is inside a protected root: ${out}`);
    if (ids.has(`${st.dev}:${st.ino}`) || st.nlink > 1)
      problems.push(`filtered output is a hardlink alias: ${out}`);
    if (st.mtimeMs < manifest.createdAtMs)
      problems.push(
        `filtered output predates the manifest, so the manifest was not taken before filtering: ${out}`,
      );
  }
  return problems;
}

/** Raw-data invariants: complete inventory unchanged, outputs contained. */
export function verifyInvariants(manifest, outputs = []) {
  const diff = compareManifest(manifest);
  const problems = [
    ...diff.added.map((p) => `added to a protected root: ${p}`),
    ...diff.modified.map((p) => `original modified: ${p}`),
    ...diff.deleted.map((p) => `original deleted: ${p}`),
    ...checkOutputs(manifest, outputs),
  ];
  return { ok: problems.length === 0, problems };
}

/** Run the existing scorer on ONE hypothesis against an isolated reference; returns its JSON row. Needs python3 and AMI annotations. */
export function scoreWer(
  annotationDir,
  meeting,
  hypPath,
  { speaker, from, to, python = 'python3' } = {},
) {
  if (speaker && !/^[A-Za-z0-9]+$/.test(speaker)) throw new Error('bad speaker id');
  const args = ['-I', SCORER];
  if (speaker) args.push('--speaker', speaker);
  if (from !== undefined) args.push('--from', String(from));
  if (to !== undefined) args.push('--to', String(to));
  const out = execFileSync(python, [...args, annotationDir, meeting, hypPath], {
    encoding: 'utf8',
  });
  const row = JSON.parse(out.trim());
  if (row.hypothesis !== basename(hypPath))
    throw new Error(`scorer returned ${row.hypothesis} for ${hypPath}`);
  return row;
}

/** Evaluate one config (see docs/research/noise-bleed-harness.md) against the plan's targets; unmeasured is never PASS. */
export function evaluate(config, { wer = scoreWer } = {}) {
  const at = (p) => resolve(config.baseDir ?? '.', p);
  const notes = [];
  const conditions = [];
  const minRef = config.minRefWords ?? 20;
  for (const c of config.conditions) {
    const row = { name: c.name, farEndOnly: !!c.farEndOnly, nearEnd: !!c.nearEnd, issues: [] };
    conditions.push(row);
    const u = parseWav(readFileSync(at(c.unfiltered)));
    const f = parseWav(readFileSync(at(c.filtered)));
    const r = parseWav(readFileSync(at(c.reference)));
    if (u.rate !== f.rate || u.rate !== r.rate) {
      row.issues.push('sample rates differ');
      continue;
    }
    const tol = Math.round(u.rate * 0.02);
    if (
      Math.abs(u.samples.length - f.samples.length) > tol ||
      Math.abs(u.samples.length - r.samples.length) > tol
    )
      row.issues.push(
        'unfiltered, filtered and reference durations differ (truncated or mismatched)',
      );
    if (row.issues.length) continue;
    if (c.farEndOnly || c.mask) {
      if (rmsOf(f.samples) < SILENT_RMS)
        row.issues.push(
          'filtered output is digital silence: suppression cannot be told from muting',
        );
      else {
        row.leakage = leakageReduction(u.samples, f.samples, r.samples, u.rate, {
          mask: c.mask,
          echoDelayMs: c.echoDelayMs,
        });
        if (!row.leakage.frames)
          row.issues.push('no far-end-active frames in the measured windows');
      }
    } else if (!c.nearEnd)
      row.issues.push(
        'leakage not measured: needs farEndOnly or a far-end-only mask (double talk would count local attenuation as echo reduction)',
      );
    if (c.nearEnd) {
      row.alignment = alignmentLag(u.samples, f.samples, u.rate);
      if (row.alignment.status !== 'ok') row.issues.push(`alignment: ${row.alignment.status}`);
      if (!c.hypUnfiltered || !c.hypFiltered || !c.meeting || !c.nearEndSpeaker)
        row.issues.push(
          'near-end WER inputs missing (meeting, nearEndSpeaker, hypUnfiltered, hypFiltered)',
        );
      else {
        const opts = { speaker: c.nearEndSpeaker, from: c.nearEndFrom, to: c.nearEndTo };
        const a = wer(at(config.annotationDir), c.meeting, at(c.hypUnfiltered), opts);
        const b = wer(at(config.annotationDir), c.meeting, at(c.hypFiltered), opts);
        if (a.ref_words < minRef || a.ref_words !== b.ref_words)
          row.issues.push(
            `near-end reference invalid (${a.ref_words}/${b.ref_words} words, need >= ${minRef} and equal)`,
          );
        else if (!a.hyp_words || !b.hyp_words) row.issues.push('empty hypothesis transcript');
        else
          row.wer = {
            unfiltered: a.wer,
            filtered: b.wer,
            refWords: a.ref_words,
            worse: b.wer > a.wer,
          };
      }
    }
  }
  let inv = { ok: true, problems: [] };
  if (config.manifest) {
    const manifest = JSON.parse(readFileSync(at(config.manifest), 'utf8'));
    inv = verifyInvariants(
      manifest,
      config.conditions.map((c) => at(c.filtered)),
    );
    config.conditions.forEach((c, i) => {
      for (const key of ['unfiltered', 'reference']) {
        let real;
        try {
          real = realpathSync(at(c[key]));
        } catch {
          continue;
        }
        if (manifest.entries[real]?.type !== 'file')
          conditions[i].issues.push(`manifest does not cover ${key} input ${c[key]}`);
      }
    });
  }
  const tri = (items, ok) =>
    !items.length || items.some((x) => x === undefined) ? null : items.every(ok);
  const fe = conditions.filter((c) => c.farEndOnly);
  const lk = conditions.filter(
    (c) => c.leakage || c.issues.some((i) => /leakage|silence|far-end-active/.test(i)),
  );
  const ne = conditions.filter((c) => c.nearEnd);
  const median12 = median(fe.map((c) => c.leakage?.medianDb));
  const live = config.liveLatencySamplesMs ?? [];
  const liveP95 = live.length >= MIN_LIVE_SAMPLES ? percentile(live, 0.95) : NaN;
  const checks = {
    medianLeakage:
      fe.length && fe.every((c) => c.leakage?.frames) ? median12 >= TARGETS.medianDb : null,
    perConditionLeakage: tri(
      lk.map((c) => c.leakage),
      (l) => l.pooledDb >= TARGETS.perConditionDb,
    ),
    offlineAlignmentLag: tri(
      ne.map((c) => (c.alignment?.status === 'ok' ? c.alignment : undefined)),
      (a) => a.ms >= -1 && a.ms < TARGETS.latencyP95Ms,
    ),
    nearEndWer: tri(
      ne.map((c) => c.wer),
      (w) => !w.worse,
    ),
    liveLatencyP95: Number.isNaN(liveP95) ? null : liveP95 < TARGETS.latencyP95Ms,
    invariants: config.manifest ? inv.ok : null,
  };
  for (const [k, v] of Object.entries(checks))
    if (v === null) notes.push(`${k} not measured or invalid`);
  for (const c of conditions) for (const i of c.issues) notes.push(`${c.name}: ${i}`);
  const verdict = Object.values(checks).includes(false)
    ? 'FAIL'
    : notes.length
      ? 'NOT_VERIFIED'
      : 'PASS';
  return {
    verdict,
    targets: TARGETS,
    medianFarEndDb: median12,
    liveLatencyP95Ms: liveP95,
    conditions,
    checks,
    problems: inv.problems,
    notes,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [a, b, ...rest] = process.argv.slice(2);
  if (a === 'manifest' && b && rest.length) {
    writeFileSync(b, JSON.stringify(createManifest(rest), null, 2), { flag: 'wx' });
    console.log(`manifest written: ${b}`);
  } else if (a && a !== 'manifest') {
    const config = JSON.parse(readFileSync(a, 'utf8'));
    config.baseDir ??= dirname(resolve(a));
    const result = evaluate(config);
    console.log(JSON.stringify(result, null, 2));
    process.exit({ PASS: 0, FAIL: 1, NOT_VERIFIED: 2 }[result.verdict]);
  } else {
    console.error('Usage: noise-bleed-metrics.mjs manifest <out.json> <path>... | <config.json>');
    process.exit(2);
  }
}
