import { describe, expect, it } from 'vitest';
import { RATE, compareTracks, findBeeps } from './b0-track-sync.mjs';

function track(seconds, beepsAt, shift = 0, noise = 0.002) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = noise * Math.sin(i * 0.37 + (i % 7));
  for (const at of beepsAt) {
    const from = Math.round((at + shift) * RATE);
    for (let i = 0; i < 0.2 * RATE; i++)
      out[from + i] += 0.2 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
  }
  return out;
}

describe('findBeeps', () => {
  it('finds the onsets of start and end beeps', () => {
    const found = findBeeps(track(290, [3.8, 275.8]));
    expect(found).toHaveLength(2);
    expect(found[0]).toBeCloseTo(3.8, 1);
    expect(found[1]).toBeCloseTo(275.8, 1);
  });
  it('ignores a 60 ms click and a 2 kHz tone', () => {
    const s = new Float32Array(5 * RATE);
    for (let i = 0; i < 0.06 * RATE; i++)
      s[RATE + i] = 0.2 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
    for (let i = 0; i < 0.2 * RATE; i++)
      s[3 * RATE + i] = 0.2 * Math.sin((2 * Math.PI * 2000 * i) / RATE);
    expect(findBeeps(s)).toEqual([]);
  });
});

describe('compareTracks', () => {
  const spacing = [3.8, 275.8];
  it('passes small offset and no drift', () => {
    const r = compareTracks(findBeeps(track(290, spacing, 0.1)), findBeeps(track(290, spacing)));
    expect(r.verdict).toBe('PASS');
    expect(r.startOffsetMs).toBeCloseTo(100, -1);
  });
  it('fails 80 ms of drift when both beeps are found', () => {
    const r = compareTracks(findBeeps(track(290, [3.9, 275.98])), findBeeps(track(290, spacing)));
    expect(r.verdict).toBe('FAIL');
  });
  it('fails an offset above 250 ms', () => {
    const r = compareTracks(findBeeps(track(290, spacing, 0.4)), findBeeps(track(290, spacing)));
    expect(r.verdict).toBe('FAIL');
  });
  it('is NOT_VERIFIED, never FAIL, when a beep is missing', () => {
    const r = compareTracks(findBeeps(track(290, [3.8])), findBeeps(track(290, spacing)));
    expect(r.verdict).toBe('NOT_VERIFIED');
  });
  it('is NOT_VERIFIED when beep spacing is implausible', () => {
    const r = compareTracks(findBeeps(track(290, [3.8, 100])), findBeeps(track(290, spacing)));
    expect(r.verdict).toBe('NOT_VERIFIED');
  });
});
