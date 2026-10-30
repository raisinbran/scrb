import { describe, expect, it } from 'vitest';
import type { TimelineGap, TranscriptSegment } from '@scrb/contracts';
import { applyTranscriptChange, buildRows, rowIndexAt } from './transcript-model.ts';

function segment(id: string, startMs: number): TranscriptSegment {
  return {
    id,
    speakerId: 'sp',
    track: 'meeting',
    startMs,
    endMs: startMs + 1000,
    words: [
      {
        id: `${id}-w`,
        text: id,
        startMs,
        endMs: startMs + 1000,
        state: 'final',
        correctionId: null,
      },
    ],
  };
}

const gap: TimelineGap = { kind: 'paused', startMs: 1500, endMs: 1800 };

describe('applyTranscriptChange', () => {
  const base = [segment('a', 0), segment('b', 1000), segment('c', 2000)];

  it('appends', () => {
    const next = applyTranscriptChange(base, { kind: 'append', segments: [segment('d', 3000)] });
    expect(next.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('replaces in timeline order', () => {
    const next = applyTranscriptChange(base, {
      kind: 'replace',
      segments: [segment('x', 1200)],
      removedSegmentIds: ['b'],
    });
    expect(next.map((item) => item.id)).toEqual(['a', 'x', 'c']);
  });

  it('realigns only the named words', () => {
    const next = applyTranscriptChange(base, {
      kind: 'realign',
      words: [{ id: 'b-w', startMs: 1100, endMs: 1900 }],
    });
    expect(next[1]?.words[0]?.startMs).toBe(1100);
    expect(next[0]).toBe(base[0]);
  });
});

describe('rows', () => {
  const rows = buildRows([segment('a', 0), segment('b', 1000), segment('c', 2000)], [gap]);

  it('puts a gap where it happened', () => {
    expect(rows.map((row) => row.key)).toEqual(['a', 'b', 'gap-0', 'c']);
  });

  it('finds the row at a time', () => {
    expect(rowIndexAt(rows, 0)).toBe(0);
    expect(rowIndexAt(rows, 1600)).toBe(2);
    expect(rowIndexAt(rows, 99_000)).toBe(3);
  });
});
