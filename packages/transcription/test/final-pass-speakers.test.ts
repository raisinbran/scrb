import { describe, expect, it } from 'vitest';
import { decideSpeakers, type FinalPassOptions } from '../src/finalPass.js';
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

  it('absorbs a 10 s voice into the large cluster', () => {
    const { raw, embedded } = fixture(10);
    const result = decideSpeakers(raw, embedded);
    expect(result.speakers).toHaveLength(1);
    expect(result.spans[0]!.speakerId).toBe(result.spans[1]!.speakerId);
  });

  it.each([
    { seconds: 14, minSpeakerMs: 30_000, speakers: 1 },
    { seconds: 10, minSpeakerMs: 0, speakers: 2 },
  ])('honors caller relabel minimum $minSpeakerMs', ({ seconds, minSpeakerMs, speakers }) => {
    const { raw, embedded } = fixture(seconds);
    const o: Pick<FinalPassOptions, 'relabel'> = { relabel: { minSpeakerMs } };
    expect(decideSpeakers(raw, embedded, o.relabel).speakers).toHaveLength(speakers);
  });
});
