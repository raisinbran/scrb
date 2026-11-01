import assert from 'node:assert/strict';
import test from 'node:test';
import { summarize, windowLags } from './call_offset.mjs';

/** Invented speech-like loudness: bursts of irregular length with pauses, one point per ms. */
function bursts(length) {
  const out = new Float32Array(length);
  let state = 0xace1;
  const next = () => {
    state = (state >> 1) ^ (state & 1 ? 0xb400 : 0);
    return state;
  };
  for (let at = 0; at < length; ) {
    const size = 80 + (next() % 600);
    const level = 200 + (next() % 3000);
    out.fill(level, at, Math.min(at + size, length));
    at += size + 40 + (next() % 500);
  }
  return out;
}

function delayed(source, lagAt, gain = 0.2) {
  return Float32Array.from(source, (_, i) => {
    const from = i - lagAt(i);
    return (from >= 0 ? source[from] : 0) * gain + ((i * 7919) % 97);
  });
}

test('finds a fixed delay through gain and noise', () => {
  const meeting = bursts(350000);
  const results = windowLags(meeting, delayed(meeting, () => 44));
  assert.ok(results.every(({ lagMs }) => lagMs === 44));
  const { driftMs, largestStepMs, pass } = summarize(results);
  assert.equal(driftMs, 0);
  assert.equal(largestStepMs, 0);
  assert.equal(pass, true);
});

test('reports a step as the largest step', () => {
  const meeting = bursts(200000);
  const summary = summarize(windowLags(meeting, delayed(meeting, (i) => (i < 100000 ? 64 : 81))));
  assert.equal(summary.startMs, 64);
  assert.equal(summary.endMs, 81);
  assert.equal(summary.largestStepMs, 17);
});

test('fails on drift over the limit', () => {
  const summary = summarize(Array.from({ length: 12 }, (_, i) => ({ atS: i, lagMs: i * 10, match: 0.9 })));
  assert.equal(summary.pass, false);
});

test('fails when too few windows match', () => {
  const summary = summarize(Array.from({ length: 12 }, (_, i) => ({ atS: i, lagMs: 44, match: i < 4 ? 0.9 : 0.1 })));
  assert.equal(summary.used, 4);
  assert.equal(summary.pass, false);
});
