import { describe, expect, it } from 'vitest';
import { buildBlocks } from '../src/blocks.js';
import { say, transcript } from './helpers.js';

describe('buildBlocks', () => {
  it('splits at speaker change and at a pause of 2 s', () => {
    const w = transcript([
      ['A', 'one two three', 3],
      ['A', 'four five six', 2],
      ['A', 'seven eight', 1],
      ['B', 'nine ten', 0],
    ]);
    const b = buildBlocks(w);
    expect(b.map((x) => x.text)).toEqual([
      'one two three',
      'four five six seven eight',
      'nine ten',
    ]);
  });
  it('cuts long blocks at the limit', () => {
    const w = say('A', Array.from({ length: 400 }, (_, i) => `w${i}`).join(' '), 0, 'x').words;
    const b = buildBlocks(w);
    expect(b.length).toBeGreaterThan(1);
    for (const x of b) expect(x.endMs - x.startMs).toBeLessThanOrEqual(60_000);
    expect(b.reduce((n, x) => n + (x.last - x.first + 1), 0)).toBe(400);
  });
  it('makes a pinned run its own block inside a longer one', () => {
    const w = say('A', Array.from({ length: 150 }, (_, i) => `w${i}`).join(' '), 0, 'x').words;
    const pinned = w.map((_, i) => (i >= 50 && i < 100 ? { pinId: 'p', itemId: 'o1' } : undefined));
    const b = buildBlocks(w, pinned);
    const mid = b.filter((x) => x.pin);
    expect(mid).toHaveLength(1);
    expect([mid[0]!.first, mid[0]!.last]).toEqual([50, 99]);
  });
  it('handles no words', () => {
    expect(buildBlocks([])).toEqual([]);
  });
});
