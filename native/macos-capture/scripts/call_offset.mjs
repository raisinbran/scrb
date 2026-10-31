// T18: start offset and drift between the tracks of a recorded call, measured from a sound both
// tracks hold, not from timestamps. Compares the two tracks' loudness over time, in windows.
// Usage: node call_offset.mjs <ffmpeg> <audio folder>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [ffmpeg, audio] = process.argv.slice(2);
const ENVELOPE_RATE = 1000;
const SAMPLES_PER_POINT = 16;
const WINDOW_S = 20;
const LAG_MIN_MS = -200;
const LAG_MAX_MS = 800;

function envelope(track) {
  const folder = join(audio, track);
  const chunks = readFileSync(join(folder, 'chunks.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const seconds = Math.ceil(chunks.at(-1).endNs / 1e9);
  const out = new Float32Array(seconds * ENVELOPE_RATE);
  for (const chunk of chunks) {
    const pcm = execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-i', join(folder, chunk.file), '-ac', '1', '-ar', '16000',
      '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 26 });
    const at = Math.round((chunk.startNs / 1e9) * ENVELOPE_RATE);
    for (let i = 0; i + SAMPLES_PER_POINT * 2 <= pcm.length; i += SAMPLES_PER_POINT * 2) {
      let sum = 0;
      for (let s = 0; s < SAMPLES_PER_POINT; s++) sum += Math.abs(pcm.readInt16LE(i + s * 2));
      out[at + i / (SAMPLES_PER_POINT * 2)] = sum / SAMPLES_PER_POINT;
    }
  }
  return out;
}

function normalized(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const out = values.map((v) => v - mean);
  const size = Math.sqrt(out.reduce((a, b) => a + b * b, 0));
  return { out, size };
}

const mic = envelope('microphone');
const meeting = envelope('meeting');
const span = Math.min(mic.length, meeting.length);
const results = [];
for (let start = 30 * ENVELOPE_RATE; start + (WINDOW_S * ENVELOPE_RATE) + LAG_MAX_MS < span; start += 30 * ENVELOPE_RATE) {
  const a = normalized(meeting.slice(start, start + WINDOW_S * ENVELOPE_RATE));
  let best = { lag: 0, r: -1 };
  if (a.size === 0) continue;
  for (let lag = LAG_MIN_MS; lag <= LAG_MAX_MS; lag++) {
    const b = normalized(mic.slice(start + lag, start + lag + WINDOW_S * ENVELOPE_RATE));
    if (b.size === 0) continue;
    let dot = 0;
    for (let i = 0; i < a.out.length; i++) dot += a.out[i] * b.out[i];
    const r = dot / (a.size * b.size);
    if (r > best.r) best = { lag, r };
  }
  results.push({ atS: start / ENVELOPE_RATE, ...best });
  console.log(`${start / ENVELOPE_RATE} s: mic after meeting by ${best.lag} ms, match ${best.r.toFixed(2)}`);
}
const good = results.filter((r) => r.r >= 0.5);
if (good.length < 3) {
  console.log(`FAIL: only ${good.length} windows matched well`);
  process.exit(1);
}
const lags = good.map((r) => r.lag).sort((a, b) => a - b);
console.log(`${good.length} of ${results.length} windows used. Median offset ${lags[Math.floor(lags.length / 2)]} ms`);
console.log(`Start ${good[0].lag} ms, end ${good.at(-1).lag} ms, change ${good.at(-1).lag - good[0].lag} ms, spread ${lags.at(-1) - lags[0]} ms`);
