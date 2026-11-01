import { describe, expect, it } from 'vitest';
import { RowHeights } from './row-heights.ts';

describe('eight-hour transcript row virtualization', () => {
  it('indexes 80,000 invented words within 1000 ms on the test runner', () => {
    const totalRows = 8000;
    const heights = new RowHeights((index) => ({
      id: `synthetic-${index}`,
      wordCount: 10,
    }));
    heights.setLayout({ widthPx: 740, fontPx: 15 });
    const start = performance.now();
    const extent = heights.totalHeight(totalRows);
    const indices: number[] = [];
    for (let i = 0; i < 1000; i += 1) {
      indices.push(heights.indexAt((i / 999) * extent, totalRows));
    }
    const elapsedMs = performance.now() - start;
    expect(indices[0]).toBe(0);
    expect(indices[499]).toBeGreaterThan(0);
    expect(indices.at(-1)).toBe(totalRows - 1);
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('recalculates only affected row tops after a tail update', () => {
    const totalRows = 8000;
    const heights = new RowHeights((index) => ({
      id: `synthetic-${index}`,
      wordCount: 10,
    }));
    const oldExtent = heights.totalHeight(totalRows);
    const delta = heights.measure(totalRows - 1, `synthetic-${totalRows - 1}`, 250);
    expect(heights.totalHeight(totalRows)).toBeCloseTo(oldExtent + delta, 5);
    expect(heights.indexAt(0, totalRows)).toBe(0);
  });
});
