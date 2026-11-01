// Run with: node --test scripts/shared_sound.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect, pairOffsets, summarize, sweep, trainPositions } from './shared_sound.mjs';

const RATE = 48000;

function noisy(seconds, level) {
  let state = 12345;
  return Float64Array.from({ length: seconds * RATE }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state / 0x7fffffff - 0.5) * level;
  });
}

function place(samples, at, gain) {
  sweep().forEach((value, i) => {
    samples[at + i] += value * gain;
  });
}

test('finds each sweep to the sample in noise louder than it', () => {
  const samples = noisy(5, 3000);
  place(samples, 24000, 800);
  place(samples, 150000, 800);
  assert.deepEqual(detect(samples), [24000, 150000]);
});

test('finds nothing in noise alone', () => {
  assert.deepEqual(detect(noisy(5, 3000)), []);
});

test('the train never spaces sweeps closer than twice the pairing window', () => {
  const positions = trainPositions(600);
  assert.ok(positions.length > 200);
  positions.slice(1).forEach((at, i) => assert.ok(at - positions[i] >= 2 * RATE));
  assert.ok(new Set(positions.slice(1).map((at, i) => at - positions[i])).size > 50);
});

test('pairs by nearest sweep and leaves out a sweep one track missed', () => {
  const meeting = [10e9, 13e9, 16e9];
  const mic = [10.03e9, 16.03e9];
  assert.deepEqual(pairOffsets(meeting, mic).map(({ offsetMs }) => Math.round(offsetMs)), [30, 30]);
});

test('reports a constant offset as no drift, and a growing one as drift', () => {
  const steady = Array.from({ length: 40 }, (_, i) => ({ atNs: i * 3e9, offsetMs: 42 }));
  assert.deepEqual(summarize(steady), { startMs: 42, endMs: 42, driftMs: 0, pass: true });
  const growing = steady.map((pair, i) => ({ ...pair, offsetMs: 42 + i * 2 }));
  const result = summarize(growing);
  assert.equal(result.pass, false);
  assert.equal(result.driftMs, 60);
});

test('needs enough pairs to pass', () => {
  const few = Array.from({ length: 5 }, (_, i) => ({ atNs: i * 3e9, offsetMs: 42 }));
  assert.equal(summarize(few).pass, false);
});
