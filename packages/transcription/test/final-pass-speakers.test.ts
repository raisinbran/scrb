import { describe, expect, it } from 'vitest';
import { decideSpeakers } from '../src/finalPass.js';
import type { RawSegment } from '../src/sherpa.js';

function fixture(seconds: number) {
  const raw: RawSegment[] = [
    { start: 0, end: 60, speaker: 0 },
    { start: 60, end: 60 + seconds, speaker: 1 },
  ];
  const embedded = raw.map((segment, i) => ({
    segment,
    vector: i === 0 ? [1, 0] : [0, 1],
  }));
  return { raw, embedded };
}

describe('final speaker absorption', () => {
  it('keeps a distinct 14 s voice separate from a large cluster', () => {
    const { raw, embedded } = fixture(14);
    const result = decideSpeakers(raw, embedded);
    expect(result.speakers).toHaveLength(2);
    expect(result.spans[0]!.speakerId).not.toBe(result.spans[1]!.speakerId);
  });

  it('keeps a distinct 14 s voice with only a caller merge line', () => {
    const { raw, embedded } = fixture(14);
    const result = decideSpeakers(raw, embedded, { mergeLine: 0.65 });
    expect(result.speakers).toHaveLength(2);
    expect(result.spans[0]!.speakerId).not.toBe(result.spans[1]!.speakerId);
  });

  it('absorbs a 9 s voice into the large cluster, whatever its similarity', () => {
    const { raw, embedded } = fixture(9);
    const result = decideSpeakers(raw, embedded);
    expect(result.speakers).toHaveLength(1);
    expect(result.spans[0]!.speakerId).toBe(result.spans[1]!.speakerId);
  });

  it('keeps a distinct 10 s voice as its own speaker', () => {
    const { raw, embedded } = fixture(10);
    expect(decideSpeakers(raw, embedded).speakers).toHaveLength(2);
  });

  it('absorbs a 20 s voice that sounds like the large cluster', () => {
    const { raw, embedded } = fixture(20);
    const similar = embedded.map((e, i) => (i === 0 ? e : { ...e, vector: [0.8, 0.6] }));
    expect(decideSpeakers(raw, similar).speakers).toHaveLength(1);
  });

  it.each([
    { seconds: 14, relabel: { shortSpeakerMs: Infinity }, speakers: 1 },
    { seconds: 14, relabel: { shortSpeakerMs: 15_000 }, speakers: 1 },
    { seconds: 9, relabel: { shortSpeakerMs: 5_000 }, speakers: 2 },
    { seconds: 9, relabel: { shortSpeakerMs: 5_000, shortMergeLine: -1 }, speakers: 1 },
  ])('honors caller relabel $relabel for $seconds s', ({ seconds, relabel, speakers }) => {
    const { raw, embedded } = fixture(seconds);
    expect(decideSpeakers(raw, embedded, relabel).speakers).toHaveLength(speakers);
  });
});

describe('final speakers when every cluster is under 30 s', () => {
  const short = (similar: boolean) => {
    const raw: RawSegment[] = [
      { start: 0, end: 20, speaker: 0 },
      { start: 20, end: 35, speaker: 1 },
      { start: 35, end: 38, speaker: 2 },
    ];
    const vectors = [[1, 0, 0], similar ? [0.9, 0.44, 0] : [0, 1, 0], [0.9, 0, 0.44]];
    return { raw, embedded: raw.map((segment, i) => ({ segment, vector: vectors[i]! })) };
  };

  it('keeps a distinct 15 s voice, and absorbs a 3 s one under the floor', () => {
    const { raw, embedded } = short(false);
    const result = decideSpeakers(raw, embedded);
    expect(result.speakers).toHaveLength(2);
    expect(result.spans.map((s) => s.speakerId)).toEqual(['speaker-1', 'speaker-2', 'speaker-1']);
  });

  it('absorbs a similar 15 s voice into the biggest cluster', () => {
    const { raw, embedded } = short(true);
    expect(decideSpeakers(raw, embedded).speakers).toHaveLength(1);
  });
});

describe('final speaker diagnostics', () => {
  it('reports counts, seconds and similarities and nothing else', () => {
    const { raw, embedded } = fixture(14);
    const { diagnostics } = decideSpeakers(raw, embedded);
    expect(diagnostics).toEqual({
      clustersBefore: 2,
      clustersAfter: 2,
      clusterSecondsBefore: '60:14',
      clusterSecondsAfter: '60:14',
      closestRawSimilarity: 0,
      closestFinalSimilarity: 0,
      mergeLine: 0.65,
      minSpeakerSeconds: expect.any(Number),
      shortSpeakerSeconds: expect.any(Number),
      shortMergeLine: expect.any(Number),
    });
  });

  it('shows the collapse: two clusters before, one after, with their closeness', () => {
    const { raw, embedded } = fixture(9);
    const { diagnostics } = decideSpeakers(raw, embedded);
    expect(diagnostics.clustersBefore).toBe(2);
    expect(diagnostics.clustersAfter).toBe(1);
    expect(diagnostics.clusterSecondsAfter).toBe('69');
    expect(diagnostics.closestRawSimilarity).toBe(0);
  });
});
