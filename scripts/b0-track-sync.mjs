// B0 track sync: find the start and end 1 kHz beeps in the microphone and meeting tracks and
// compute their offset and start-to-end drift. Usage: node b0-track-sync.mjs <ffmpeg> <audio folder>
// Add --list to print each track's beep onsets only (preflight). Verdict is PASS, FAIL or NOT_VERIFIED (exit 0, 1, 2). A measurement problem is never PASS or FAIL.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RATE = 16000;
export const LIMITS = { offsetMs: 250, driftMs: 50 };
// Beep onsets in remote.wav file time: start beep 1.8 to 2.0 s, end beep at 274.0 s.
export const EXPECTED_SPACING_S = 274.0 - 1.8;
const FRAME = 160;

function toneFrames(samples) {
  const k = (2 * Math.PI * 1000) / RATE;
  const flags = [];
  for (let at = 0; at + FRAME <= samples.length; at += FRAME) {
    let re = 0,
      im = 0,
      energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = samples[at + i];
      re += v * Math.cos(k * i);
      im += v * Math.sin(k * i);
      energy += v * v;
    }
    const rms = Math.sqrt(energy / FRAME);
    const tone = ((re * re + im * im) * 2) / FRAME; // power carried by a 1 kHz sinusoid
    flags.push(rms >= 0.01 && tone / Math.max(energy, 1e-12) >= 0.6);
  }
  return flags;
}

/** Onset times (s) of runs of 1 kHz tone lasting 120 to 400 ms; one-frame dropouts are bridged. */
export function findBeeps(samples) {
  const flags = toneFrames(samples);
  const runs = [];
  let start = -1,
    last = -1;
  const close = () => {
    if (start >= 0) {
      const ms = (last - start + 1) * 10;
      if (ms >= 120 && ms <= 400) runs.push((start * FRAME) / RATE);
    }
    start = -1;
  };
  flags.forEach((on, i) => {
    if (on) {
      if (start < 0) start = i;
      last = i;
    } else if (start >= 0 && i - last > 2) close();
  });
  close();
  return runs;
}

/** Offset and drift between tracks from their first and last beeps. */
export function compareTracks(micBeeps, meetingBeeps) {
  const need = (name, beeps) =>
    beeps.length >= 2 ? null : `${name}: found ${beeps.length} beep(s), need start and end`;
  const problem = need('microphone', micBeeps) ?? need('meeting', meetingBeeps);
  if (problem) return { verdict: 'NOT_VERIFIED', reason: problem };
  const span = (b) => b.at(-1) - b[0];
  for (const [name, b] of [
    ['microphone', micBeeps],
    ['meeting', meetingBeeps],
  ]) {
    if (Math.abs(span(b) - EXPECTED_SPACING_S) > 2) {
      return {
        verdict: 'NOT_VERIFIED',
        reason: `${name}: first-to-last beep ${span(b).toFixed(3)} s, expected about ${EXPECTED_SPACING_S.toFixed(1)} s`,
      };
    }
  }
  const startOffsetMs = (micBeeps[0] - meetingBeeps[0]) * 1000;
  const endOffsetMs = (micBeeps.at(-1) - meetingBeeps.at(-1)) * 1000;
  const driftMs = endOffsetMs - startOffsetMs;
  const ok =
    Math.abs(startOffsetMs) <= LIMITS.offsetMs &&
    Math.abs(endOffsetMs) <= LIMITS.offsetMs &&
    Math.abs(driftMs) <= LIMITS.driftMs;
  return { verdict: ok ? 'PASS' : 'FAIL', startOffsetMs, endOffsetMs, driftMs };
}

function loadTrack(ffmpeg, audio, track) {
  const folder = join(audio, track);
  const chunks = readFileSync(join(folder, 'chunks.log'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const out = new Float32Array(Math.ceil((chunks.at(-1).endNs / 1e9) * RATE) + RATE);
  for (const chunk of chunks) {
    const raw = execFileSync(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        join(folder, chunk.file),
        '-ac',
        '1',
        '-ar',
        String(RATE),
        '-f',
        'f32le',
        'pipe:1',
      ],
      { maxBuffer: 1 << 28 },
    );
    const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
    out.set(
      pcm.subarray(0, Math.min(pcm.length, out.length - Math.round((chunk.startNs / 1e9) * RATE))),
      Math.round((chunk.startNs / 1e9) * RATE),
    );
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [ffmpeg, audio] = process.argv.slice(2);
  if (!ffmpeg || !audio) {
    console.error('usage: node b0-track-sync.mjs <ffmpeg> <audio folder> [--list]');
    process.exit(2);
  }
  let result;
  try {
    const mic = findBeeps(loadTrack(ffmpeg, audio, 'microphone'));
    const meeting = findBeeps(loadTrack(ffmpeg, audio, 'meeting'));
    if (process.argv[4] === '--list') {
      console.log(JSON.stringify({ micBeepsS: mic, meetingBeepsS: meeting }));
      process.exit(0);
    }
    result = { micBeepsS: mic, meetingBeepsS: meeting, ...compareTracks(mic, meeting) };
  } catch (error) {
    result = { verdict: 'NOT_VERIFIED', reason: `measurement failed: ${error.message}` };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit({ PASS: 0, FAIL: 1 }[result.verdict] ?? 2);
}
