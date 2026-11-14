import { describe, expect, it } from 'vitest';
import type { TranscriptionQuality } from '@scrb/contracts';
import { recommendQuality, resolvePerformance } from './performance.ts';

const QUALITIES: TranscriptionQuality[] = ['fast', 'balanced', 'accurate'];
const CORES = [1, 2, 3, 4, 5, 7, 9, 10, 12, 64];

describe('resolvePerformance', () => {
  it('gives whole thread counts inside 2 to 8 for every preset and core count', () => {
    for (const q of QUALITIES)
      for (const cores of CORES) {
        const p = resolvePerformance(q, { cores, memoryBytes: 16 * 1024 ** 3 });
        for (const n of [p.liveThreads, p.finalThreads]) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(2);
          expect(n).toBeLessThanOrEqual(8);
        }
      }
  });

  it('matches the plan table on a 10-core Mac', () => {
    const hw = { cores: 10, memoryBytes: 16 * 1024 ** 3 };
    expect(resolvePerformance('fast', hw)).toEqual({
      live: false,
      liveThreads: 2,
      finalThreads: 2,
    });
    expect(resolvePerformance('balanced', hw)).toEqual({
      live: true,
      liveThreads: 4,
      finalThreads: 4,
    });
    expect(resolvePerformance('accurate', hw)).toEqual({
      live: true,
      liveThreads: 8,
      finalThreads: 8,
    });
  });

  it('changes the plan for every preset, so no control is dead', () => {
    const hw = { cores: 10, memoryBytes: 16 * 1024 ** 3 };
    const plans = QUALITIES.map((q) => JSON.stringify(resolvePerformance(q, hw)));
    expect(new Set(plans).size).toBe(3);
  });

  it('turns live off only for Fast', () => {
    const hw = { cores: 8, memoryBytes: 16 * 1024 ** 3 };
    expect(QUALITIES.map((q) => resolvePerformance(q, hw).live)).toEqual([false, true, true]);
  });

  it('survives a nonsense core count', () => {
    const p = resolvePerformance('accurate', { cores: Number.NaN, memoryBytes: 0 });
    expect(p.finalThreads).toBe(2);
  });
});

describe('recommendQuality', () => {
  const GIB = 1024 ** 3;
  it('follows the fixed rule and never recommends Best quality', () => {
    expect(recommendQuality({ cores: 8, memoryBytes: 4 * GIB })).toBe('fast');
    expect(recommendQuality({ cores: 2, memoryBytes: 16 * GIB })).toBe('fast');
    expect(recommendQuality({ cores: 4, memoryBytes: 8 * GIB })).toBe('balanced');
    expect(recommendQuality({ cores: 16, memoryBytes: 64 * GIB })).toBe('balanced');
  });
});
