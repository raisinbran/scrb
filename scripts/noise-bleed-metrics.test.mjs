import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addedLatencyMs,
  encodeWav,
  evaluate,
  leakageReduction,
  parseWav,
  roomEcho,
  snapshot,
  verifyInvariants,
} from './noise-bleed-metrics.mjs';

const RATE = 16000;
// Deterministic pseudo-speech: bursts of a chirpy tone (no RNG).
function speech(seconds) {
  const x = new Float32Array(seconds * RATE);
  for (let i = 0; i < x.length; i++) {
    const env = Math.sin((Math.PI * i) / (0.4 * RATE)) ** 2;
    x[i] = 0.2 * env * (Math.sin(i * 0.05 + 3 * Math.sin(i * 0.0007)) + 0.5 * Math.sin(i * 0.11));
  }
  return x;
}
const scale = (x, g) => x.map((v) => v * g);
const delay = (x, n) => Float32Array.from({ length: x.length }, (_, i) => (i >= n ? x[i - n] : 0));

describe('wav round trip', () => {
  it('encodes and parses', () => {
    const w = parseWav(encodeWav(Float32Array.from([0, 0.5, -0.5]), RATE));
    expect(w.rate).toBe(RATE);
    expect(w.samples[1]).toBeCloseTo(0.5, 3);
  });
  it('rejects non-WAV', () => expect(() => parseWav(Buffer.from('nope nope nope'))).toThrow());
});

describe('roomEcho', () => {
  it('is deterministic and starts at the delay', () => {
    const ref = speech(1);
    const a = roomEcho(ref, RATE, 100);
    expect(a).toEqual(roomEcho(ref, RATE, 100));
    expect(a[Math.round(0.099 * RATE)]).toBe(0);
  });
});

describe('leakageReduction', () => {
  it('reports 20 dB for a tenth-amplitude filtered copy', () => {
    const ref = speech(3);
    const mic = roomEcho(ref, RATE, 200, 0.5);
    const r = leakageReduction(mic, scale(mic, 0.1), ref, RATE);
    expect(r.medianDb).toBeCloseTo(20, 1);
    expect(r.pooledDb).toBeCloseTo(20, 1);
  });
  it('ignores frames where the far end is silent', () => {
    const ref = new Float32Array(RATE);
    expect(leakageReduction(speech(1), speech(1), ref, RATE).frames).toBe(0);
  });
  it('honours a window mask', () => {
    const ref = speech(3);
    const r = leakageReduction(ref, scale(ref, 0.5), ref, RATE, { mask: [{ from: 0, to: 1 }] });
    expect(r.frames).toBeLessThanOrEqual(50);
  });
});

describe('addedLatencyMs', () => {
  it('finds a 20 ms delay', () => {
    const x = speech(3);
    expect(addedLatencyMs(x, delay(x, 320), RATE)).toBeCloseTo(20, 0);
  });
});

describe('invariants', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bleed-'));
  mkdirSync(join(dir, 'orig'));
  mkdirSync(join(dir, 'work'));
  writeFileSync(join(dir, 'orig', 'mic.wav'), 'raw');
  it('passes when untouched and filtered output is elsewhere', () => {
    const before = snapshot([join(dir, 'orig')]);
    expect(verifyInvariants(before, [join(dir, 'work', 'mic.wav')]).ok).toBe(true);
  });
  it('flags modified originals, originals as outputs, and outputs beside originals', () => {
    const before = snapshot([join(dir, 'orig')]);
    expect(
      verifyInvariants(before, [join(dir, 'orig', 'mic.wav')]).problems.length,
    ).toBeGreaterThan(0);
    expect(verifyInvariants(before, [join(dir, 'orig', 'filtered.wav')]).ok).toBe(false);
    writeFileSync(join(dir, 'orig', 'mic.wav'), 'changed');
    expect(verifyInvariants(before, []).problems[0]).toMatch(/original changed/);
  });
});

describe('evaluate', () => {
  function setup(gain, werFiltered) {
    const dir = mkdtempSync(join(tmpdir(), 'bleed-eval-'));
    for (const d of ['orig', 'work']) mkdirSync(join(dir, d));
    const ref = speech(3);
    const mic = roomEcho(ref, RATE, 150, 0.5);
    writeFileSync(join(dir, 'orig', 'mic.wav'), encodeWav(mic, RATE));
    writeFileSync(join(dir, 'orig', 'ref.wav'), encodeWav(ref, RATE));
    writeFileSync(join(dir, 'work', 'filt.wav'), encodeWav(scale(mic, gain), RATE));
    const config = {
      baseDir: dir,
      originals: ['orig'],
      annotationDir: 'ann',
      conditions: [
        {
          name: 'far-end-only',
          farEndOnly: true,
          unfiltered: 'orig/mic.wav',
          filtered: 'work/filt.wav',
          reference: 'orig/ref.wav',
          meeting: 'X',
          hypUnfiltered: 'h1',
          hypFiltered: 'h2',
        },
      ],
    };
    const wer = (_a, _m, [u, f]) => ({
      [u]: { wer: 0.2, ref_words: 100 },
      [f]: { wer: werFiltered, ref_words: 100 },
    });
    return { config, wer };
  }
  it('passes at 20 dB with equal WER', () => {
    const { config, wer } = setup(0.1, 0.2);
    expect(evaluate(config, { wer }).verdict).toBe('PASS');
  });
  it('fails on weak leakage reduction', () => {
    const { config, wer } = setup(0.7, 0.2);
    const r = evaluate(config, { wer });
    expect(r.verdict).toBe('FAIL');
    expect(r.checks.medianLeakage).toBe(false);
  });
  it('fails when near-end WER is worse', () => {
    const { config, wer } = setup(0.1, 0.25);
    expect(evaluate(config, { wer }).werWorse).toEqual(['far-end-only']);
  });
  it('is NOT_VERIFIED when nothing about WER was supplied', () => {
    const { config } = setup(0.1, 0.2);
    delete config.conditions[0].hypUnfiltered;
    expect(evaluate(config).verdict).toBe('NOT_VERIFIED');
  });
});
