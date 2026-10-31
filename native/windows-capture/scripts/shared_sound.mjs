// T18: offset and drift between the tracks, measured from the saved audio with a shared sound.
// The sound is invented: 60 ms sweeps at irregular spacing, so a sweep cannot pair with its neighbour.
// Usage: node shared_sound.mjs make <out.wav> [minutes, default 10]
//        node shared_sound.mjs measure <dir holding audio/>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 48000;
const SWEEP_SECONDS = 0.06;
const SWEEP_FROM_HZ = 800;
const SWEEP_TO_HZ = 3200;
const MIN_SPACING_SECONDS = 2;
const PAIR_WINDOW_SECONDS = 1; // under half the spacing
const MIN_MATCH = 0.35; // of a perfect match; noise and room sounds stay well below it
const EDGE_PAIRS = 10;
const MIN_PAIRS = 2 * EDGE_PAIRS;
const DRIFT_LIMIT_MS = 50;

export function sweep() {
  const count = Math.round(SWEEP_SECONDS * RATE);
  const rate = (SWEEP_TO_HZ - SWEEP_FROM_HZ) / SWEEP_SECONDS;
  return Float64Array.from({ length: count }, (_, i) => {
    const t = i / RATE;
    const window = Math.sin((Math.PI * i) / (count - 1)) ** 2;
    return window * Math.sin(2 * Math.PI * (SWEEP_FROM_HZ * t + (rate * t * t) / 2));
  });
}

/** Sample positions of the train. Fixed, so every file is the same. */
export function trainPositions(seconds) {
  const positions = [];
  let state = 0xace1;
  for (let at = 1; at < seconds - 1; ) {
    positions.push(Math.round(at * RATE));
    state = (state >> 1) ^ (state & 1 ? 0xb400 : 0);
    at += MIN_SPACING_SECONDS + (state % 1000) / 1000;
  }
  return positions;
}

function makeWav(path, seconds) {
  const pulse = sweep();
  const pcm = new Int16Array(seconds * RATE);
  for (const at of trainPositions(seconds)) {
    pulse.forEach((value, i) => {
      pcm[at + i] = Math.round(value * 0.8 * 32767);
    });
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

function fft(re, im, inverse) {
  const size = re.length;
  for (let i = 1, j = 0; i < size; i += 1) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length;
    const half = length / 2;
    for (let start = 0; start < size; start += length) {
      for (let k = 0; k < half; k += 1) {
        const c = Math.cos(angle * k);
        const s = Math.sin(angle * k);
        const a = start + k;
        const b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** Where the sweep starts in `samples`, in samples. Only whole sweeps count. */
export function detect(samples) {
  const pulse = sweep();
  if (samples.length < pulse.length) return [];
  let size = 1;
  while (size < samples.length + pulse.length) size *= 2;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const pulseRe = new Float64Array(size);
  const pulseIm = new Float64Array(size);
  re.set(samples);
  pulseRe.set(pulse);
  fft(re, im, false);
  fft(pulseRe, pulseIm, false);
  for (let i = 0; i < size; i += 1) {
    const r = re[i] * pulseRe[i] + im[i] * pulseIm[i];
    im[i] = im[i] * pulseRe[i] - re[i] * pulseIm[i];
    re[i] = r;
  }
  fft(re, im, true);
  const usable = samples.length - pulse.length + 1;
  const pulseEnergy = pulse.reduce((sum, value) => sum + value * value, 0);
  const scores = new Float64Array(usable);
  let energy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    energy += samples[i] * samples[i];
    if (i >= pulse.length) energy -= samples[i - pulse.length] ** 2;
    const at = i - pulse.length + 1;
    if (at >= 0 && energy > 1) scores[at] = Math.abs(re[at]) / size / Math.sqrt(pulseEnergy * energy);
  }
  const peaks = [];
  for (let i = 0; i < usable; i += 1) {
    if (scores[i] <= MIN_MATCH) continue;
    const last = peaks.at(-1);
    if (last !== undefined && i - last < RATE / 2) {
      if (scores[i] > scores[last]) peaks[peaks.length - 1] = i;
    } else {
      peaks.push(i);
    }
  }
  return peaks;
}

/** Mic minus meeting, in ms, for each sweep heard on both tracks. */
export function pairOffsets(meetingNs, micNs) {
  const pairs = [];
  for (const at of meetingNs) {
    let nearest = null;
    for (const other of micNs) {
      if (nearest === null || Math.abs(other - at) < Math.abs(nearest - at)) nearest = other;
    }
    if (nearest !== null && Math.abs(nearest - at) <= PAIR_WINDOW_SECONDS * 1e9) {
      pairs.push({ atNs: at, offsetMs: (nearest - at) / 1e6 });
    }
  }
  return pairs;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

export function summarize(pairs) {
  const offsets = pairs.map(({ offsetMs }) => offsetMs);
  const startMs = median(offsets.slice(0, EDGE_PAIRS));
  const endMs = median(offsets.slice(-EDGE_PAIRS));
  const driftMs = endMs - startMs;
  return { startMs, endMs, driftMs, pass: pairs.length >= MIN_PAIRS && Math.abs(driftMs) < DRIFT_LIMIT_MS };
}

function chunksOf(audioDir, track) {
  const folder = join(audioDir, track);
  const log = join(folder, 'chunks.log');
  if (!existsSync(log)) return JSON.parse(readFileSync(join(folder, 'chunks.json'), 'utf8')).chunks;
  return readFileSync(log, 'utf8').split('\n').flatMap((line) => {
    try { return line ? [JSON.parse(line)] : []; }
    catch { return []; } // a killed worker can leave a cut-off line
  });
}

function sweepTimes(audioDir, track, verify, scratch) {
  const times = [];
  const raw = join(scratch, 'chunk.raw');
  const chunks = chunksOf(audioDir, track);
  for (const chunk of chunks) {
    execFileSync(verify, ['--pcm', join(audioDir, track, chunk.file), raw]);
    const bytes = readFileSync(raw);
    const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    for (const at of detect(Float64Array.from(pcm))) times.push(chunk.startNs + (at / RATE) * 1e9);
  }
  return times;
}

function measure(dir) {
  const audioDir = join(resolve(dir), 'audio');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
  const scratch = mkdtempSync(join(tmpdir(), 'scrb-shared-sound-'));
  let meeting;
  let mic;
  try {
    meeting = sweepTimes(audioDir, 'meeting', verify, scratch);
    mic = sweepTimes(audioDir, 'microphone', verify, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true }); // decoded call audio
  }
  const pairs = pairOffsets(meeting, mic);
  console.log(`sweeps: meeting ${meeting.length}, microphone ${mic.length}, paired ${pairs.length}`);
  if (!pairs.length) {
    console.log('FAIL: no sweep was heard on both tracks');
    return 1;
  }
  const { startMs, endMs, driftMs, pass } = summarize(pairs);
  const span = (pairs.at(-1).atNs - pairs[0].atNs) / 1e9;
  console.log(`mic minus meeting: start ${startMs.toFixed(2)} ms, end ${endMs.toFixed(2)} ms, over ${span.toFixed(1)} s`);
  console.log(`drift ${driftMs.toFixed(2)} ms against ${DRIFT_LIMIT_MS} ms; at least ${MIN_PAIRS} pairs needed`);
  for (const { atNs, offsetMs } of pairs) console.log(`  ${(atNs / 1e9).toFixed(3)} s ${offsetMs.toFixed(2)} ms`);
  console.log(pass ? 'PASS' : 'FAIL');
  return pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, path, minutes] = process.argv.slice(2);
  if (command === 'make' && path) makeWav(path, Number(minutes ?? 10) * 60);
  else if (command === 'measure' && path) process.exitCode = measure(path);
  else throw new Error('Usage: shared_sound.mjs make <out.wav> [minutes] | measure <dir>');
}
