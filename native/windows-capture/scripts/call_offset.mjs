// T18: start offset and drift of a recorded call, measured from the speech both tracks hold.
// Same method as native/macos-capture/scripts/call_offset.mjs: compares the tracks' loudness over
// time, window by window. Prints every window, because a sudden step can hide inside a small drift.
// Usage: node call_offset.mjs <dir holding audio/>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunksOf } from './shared_sound.mjs';

const SAMPLES_PER_POINT = 48; // one point per ms at 48 kHz
const WINDOW_MS = 20000;
const STEP_MS = 30000;
const LAG_MIN_MS = -200;
const LAG_MAX_MS = 800;
const MIN_MATCH = 0.5;
const EDGE_WINDOWS = 5;
const MIN_WINDOWS = 2 * EDGE_WINDOWS;
const DRIFT_LIMIT_MS = 50;

/** Pearson match of `a` against `b` starting at `at`. */
function match(a, b, at) {
  const count = a.length;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < count; i += 1) {
    sumA += a[i];
    sumB += b[at + i];
  }
  const meanA = sumA / count;
  const meanB = sumB / count;
  let dot = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (let i = 0; i < count; i += 1) {
    const x = a[i] - meanA;
    const y = b[at + i] - meanB;
    dot += x * y;
    sizeA += x * x;
    sizeB += y * y;
  }
  return sizeA && sizeB ? dot / Math.sqrt(sizeA * sizeB) : -1;
}

/** Mic after meeting, in ms, for each window. Envelopes hold one point per ms. */
export function windowLags(meeting, mic) {
  const results = [];
  const span = Math.min(meeting.length, mic.length);
  for (let start = -LAG_MIN_MS; start + WINDOW_MS + LAG_MAX_MS <= span; start += STEP_MS) {
    const window = meeting.subarray(start, start + WINDOW_MS);
    let best = { lagMs: 0, match: -1 };
    for (let lagMs = LAG_MIN_MS; lagMs <= LAG_MAX_MS; lagMs += 1) {
      const score = match(window, mic, start + lagMs);
      if (score > best.match) best = { lagMs, match: score };
    }
    results.push({ atS: start / 1000, ...best });
  }
  return results;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

export function summarize(results) {
  const good = results.filter(({ match: score }) => score >= MIN_MATCH);
  const lags = good.map(({ lagMs }) => lagMs);
  const startMs = median(lags.slice(0, EDGE_WINDOWS));
  const endMs = median(lags.slice(-EDGE_WINDOWS));
  let largestStepMs = 0;
  for (let i = 1; i < lags.length; i += 1) {
    if (Math.abs(lags[i] - lags[i - 1]) > Math.abs(largestStepMs)) largestStepMs = lags[i] - lags[i - 1];
  }
  const driftMs = endMs - startMs;
  const pass = good.length >= MIN_WINDOWS && Math.abs(driftMs) < DRIFT_LIMIT_MS;
  return { used: good.length, startMs, endMs, driftMs, largestStepMs, pass };
}

function envelope(audioDir, track, verify, scratch) {
  const chunks = chunksOf(audioDir, track);
  const raw = join(scratch, 'chunk.raw');
  const out = new Float32Array(Math.ceil(Math.max(...chunks.map(({ endNs }) => endNs)) / 1e6));
  for (const chunk of chunks) {
    execFileSync(verify, ['--pcm', join(audioDir, track, chunk.file), raw]);
    const bytes = readFileSync(raw);
    const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    const at = Math.round(chunk.startNs / 1e6);
    for (let i = 0; i + SAMPLES_PER_POINT <= pcm.length; i += SAMPLES_PER_POINT) {
      let sum = 0;
      for (let s = 0; s < SAMPLES_PER_POINT; s += 1) sum += Math.abs(pcm[i + s]);
      out[at + i / SAMPLES_PER_POINT] = sum / SAMPLES_PER_POINT;
    }
  }
  return out;
}

function measure(dir) {
  const audioDir = join(resolve(dir), 'audio');
  const verify = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'build', 'bin', 'ChunkVerify.exe');
  const scratch = mkdtempSync(join(tmpdir(), 'scrb-call-offset-'));
  let meeting;
  let mic;
  try {
    meeting = envelope(audioDir, 'meeting', verify, scratch);
    mic = envelope(audioDir, 'microphone', verify, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true }); // decoded call audio
  }
  const results = windowLags(meeting, mic);
  for (const { atS, lagMs, match: score } of results) console.log(`  ${atS.toFixed(1)} s ${lagMs} ms, match ${score.toFixed(2)}`);
  const { used, startMs, endMs, driftMs, largestStepMs, pass } = summarize(results);
  console.log(`windows used: ${used} of ${results.length}; at least ${MIN_WINDOWS} needed`);
  if (used) console.log(`mic after meeting: start ${startMs} ms, end ${endMs} ms, drift ${driftMs} ms against ${DRIFT_LIMIT_MS} ms; largest step ${largestStepMs} ms`);
  console.log(pass ? 'PASS' : 'FAIL');
  return pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: call_offset.mjs <dir>');
  process.exitCode = measure(process.argv[2]);
}
