import { describe, expect, it } from 'vitest';
import {
  LiveClusterer,
  UNNAMED_LABEL,
  assignSpeakers,
  embeddingSpans,
  relabelClusters,
  unit,
  type RawCluster,
} from '../src/speakers.js';

/** A voice along one axis with a small part of a shared direction. */
function voice(axis: number, shared = 0.3, dim = 8): number[] {
  const v = new Array<number>(dim).fill(0);
  v[axis] = 1;
  v[dim - 1] = shared;
  return unit(v);
}

describe('LiveClusterer', () => {
  it('keeps "Speaker ?" until about 30 s of speech, then numbers in order', () => {
    const c = new LiveClusterer();
    const a = c.add(voice(0), 29_000);
    expect(c.label(a)).toBe(UNNAMED_LABEL);
    expect(c.add(voice(0), 2000)).toBe(a);
    expect(c.label(a)).toBe('Speaker 1');
    const b = c.add(voice(1), 31_000);
    expect(b).not.toBe(a);
    expect(c.label(b)).toBe('Speaker 2');
  });

  it('joins at the line and splits below it', () => {
    const c = new LiveClusterer({ joinSimilarity: 0.5 });
    const a = c.add([1, 0], 1000);
    expect(c.add(unit([1, 0.9]), 1000)).toBe(a);
    expect(c.add([0, 1], 1000)).not.toBe(a);
  });

  it('merges converged speakers and keeps the number already shown', () => {
    const c = new LiveClusterer({ joinSimilarity: 0.7 });
    const a = c.add(unit([1, 0.0]), 40_000);
    const b = c.add(unit([0.3, 1]), 31_000);
    expect(c.label(a)).toBe('Speaker 1');
    expect(c.label(b)).toBe('Speaker 2');
    expect(c.mergeConverged()).toEqual([]);
    // New speech drags b's centroid toward a.
    c.add(unit([0.75, 1]), 60_000);
    c.add(unit([1, 0.72]), 60_000);
    const merges = c.mergeConverged();
    expect(merges).toHaveLength(1);
    expect(c.resolve(a)).toBe(c.resolve(b));
    expect(c.label(b)).toBe('Speaker 1');
    expect(c.speakerCount).toBe(1);
  });

  it('stays bounded by dropping the smallest unnamed clusters', () => {
    const c = new LiveClusterer({ maxSpeakers: 3, joinSimilarity: 0.99 });
    const named = c.add(voice(0, 0), 40_000);
    for (let i = 1; i < 7; i++) c.add(voice(i, 0), 1000 * i);
    c.mergeConverged();
    expect(c.speakerCount).toBe(3);
    expect(c.label(named)).toBe('Speaker 1');
  });
});

describe('relabelClusters', () => {
  const cluster = (raw: number, seconds: number, embedding: number[] | null): RawCluster => ({
    raw, speechMs: seconds * 1000, embedding, embeddedSegments: 5,
  });

  it('merges one person split in two and keeps distinct people apart', () => {
    const map = relabelClusters([
      cluster(0, 300, voice(0)),
      cluster(1, 200, voice(1)),
      cluster(2, 100, unit([...voice(0).slice(0, 7), 0.45])),
      cluster(3, 150, voice(2)),
    ]);
    expect(map.get(0)).toBe(map.get(2));
    expect(new Set(map.values()).size).toBe(3);
    expect(map.get(1)).not.toBe(map.get(3));
  });

  it('absorbs stray clusters under 30 s into the nearest speaker', () => {
    const map = relabelClusters([
      cluster(0, 300, voice(0)),
      cluster(1, 200, voice(1)),
      cluster(2, 10, voice(1, 0.5)),
    ]);
    expect(map.get(2)).toBe(map.get(1));
    expect(new Set(map.values()).size).toBe(2);
  });

  it('honors a known speaker count', () => {
    const clusters = [0, 1, 2, 3, 4].map((i) => cluster(i, 100 + i, voice(i)));
    expect(new Set(relabelClusters(clusters, { knownSpeakers: 2 }).values()).size).toBe(2);
  });

  it('fills a known count from small clusters when too few are large', () => {
    const map = relabelClusters(
      [cluster(0, 300, voice(0)), cluster(1, 20, voice(1)), cluster(2, 5, voice(2))],
      { knownSpeakers: 2 },
    );
    expect(new Set(map.values()).size).toBe(2);
  });

  it('numbers the biggest speaker first and tolerates voiceless clusters', () => {
    const map = relabelClusters([
      cluster(0, 50, voice(0)),
      cluster(1, 500, voice(1)),
      cluster(2, 3, null),
    ]);
    expect(map.get(1)).toBe(0);
    expect(map.has(2)).toBe(true);
  });
});

describe('embeddingSpans', () => {
  it('takes long stretches, longest first, capped per speaker', () => {
    const segments = [
      { start: 0, end: 1, speaker: 0 },
      { start: 2, end: 4, speaker: 0 },
      { start: 5, end: 9, speaker: 0 },
      { start: 10, end: 12, speaker: 1 },
    ];
    const spans = embeddingSpans(segments, { maxPerSpeaker: 1 });
    expect(spans).toEqual([{ start: 5, end: 9, speaker: 0 }, { start: 10, end: 12, speaker: 1 }]);
  });
});

describe('assignSpeakers', () => {
  const spans = [
    { startMs: 0, endMs: 1000, speakerId: 'a' },
    { startMs: 800, endMs: 2000, speakerId: 'b' },
    { startMs: 5000, endMs: 6000, speakerId: 'c' },
  ];

  it('uses the span with the most overlap', () => {
    const words = [{ startMs: 100, endMs: 500 }, { startMs: 850, endMs: 1500 }];
    expect(assignSpeakers(words, spans, 'x')).toEqual(['a', 'b']);
  });

  it('falls back to the nearest span, then the default', () => {
    expect(assignSpeakers([{ startMs: 4000, endMs: 4500 }], spans, 'x')).toEqual(['c']);
    expect(assignSpeakers([{ startMs: 1, endMs: 2 }], [], 'x')).toEqual(['x']);
  });
});
