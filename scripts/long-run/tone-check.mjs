// Prints numbers only: checks that the MEETING track of a long-run evidence folder holds the invented 880 Hz tone.
// Usage: node scripts/long-run/tone-check.mjs <evidence folder> [--ffmpeg <exe>] [--chunks N]
// Reads only <folder>/audio/meeting/*.opus (the invented tone). It never opens the microphone track, which hears the room.
// It prints levels and a verdict; it never writes or prints audio. Exit 0 = tone present on every sampled chunk.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const folder = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!folder) {
  console.error('usage: node scripts/long-run/tone-check.mjs <evidence folder> [--ffmpeg <exe>] [--chunks N]');
  process.exit(2);
}
const ffmpeg = resolve(opt('--ffmpeg', 'packages/transcription/.bin/ffmpeg.exe'));
const want = Number(opt('--chunks', '5'));
const dir = join(resolve(folder), 'audio', 'meeting');
if (!existsSync(dir)) { console.error(`no meeting folder: ${dir}`); process.exit(2); }
const files = readdirSync(dir).filter((f) => f.endsWith('.opus')).sort();
if (files.length === 0) { console.error('no meeting chunks'); process.exit(2); }
// Evenly spread sample, always including the first and last chunk.
const picks = [...new Set(Array.from({ length: Math.min(want, files.length) }, (_, k) =>
  Math.round((k * (files.length - 1)) / Math.max(1, Math.min(want, files.length) - 1))))];

const RATE = 16000;
function amplitudeAt(x, hz) {  // Goertzel: amplitude of the sinusoid at hz (full scale = 1.0)
  const w = (2 * Math.PI * hz) / RATE, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  const re = s1 - s2 * Math.cos(w), im = s2 * Math.sin(w);
  return (2 * Math.sqrt(re * re + im * im)) / x.length;
}

let allOk = true;
for (const k of picks) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', join(dir, files[k]), '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
    { maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.log(`${files[k]}: decode failed (ffmpeg exit ${r.status})`); allOk = false; continue; }
  const n = r.stdout.length >> 1;
  const x = new Float64Array(n);
  let sq = 0;
  for (let i = 0; i < n; i++) { x[i] = r.stdout.readInt16LE(i * 2) / 32768; sq += x[i] * x[i]; }
  const rms = Math.sqrt(sq / n);
  const a880 = amplitudeAt(x, 880);
  const off = Math.max(amplitudeAt(x, 440), amplitudeAt(x, 1320), amplitudeAt(x, 1000));
  const share = rms > 0 ? (a880 / Math.SQRT2) / rms : 0;  // 1.0 = all energy at 880 Hz
  const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
  const ok = rms > 0.001 && share > 0.8 && a880 > 4 * off;
  if (!ok) allOk = false;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${files[k]}: rms ${db(rms)} dBFS, 880 Hz ${db(a880)} dBFS, nearest off-tone ${db(off)} dBFS, ${(share * 100).toFixed(1)}% of energy at 880 Hz, ${n / RATE} s`);
}
console.log(allOk ? 'TONE: PASS (880 Hz present on every sampled meeting chunk)' : 'TONE: FAIL');
process.exit(allOk ? 0 : 1);
