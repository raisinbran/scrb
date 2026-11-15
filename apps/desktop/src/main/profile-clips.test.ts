// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Speaker, TimelineGap, TranscriptSegment } from '@scrb/contracts';
import { chooseClip } from './profile-clips.ts';

const speakers: Speaker[] = [
  { id: 'you', label: 'You', kind: 'you', profileId: 'p-you' },
  { id: 'a', label: 'Ana', kind: 'named', profileId: 'p-1' },
  { id: 'b', label: 'Ben', kind: 'named', profileId: null },
];

const seg = (
  id: string,
  speakerId: string,
  startMs: number,
  endMs: number,
  words = 12,
  extra: Partial<TranscriptSegment> = {},
): TranscriptSegment => ({
  id,
  speakerId,
  track: 'meeting',
  startMs,
  endMs,
  words: Array.from({ length: words }, (_, i) => ({
    id: `${id}-${i}`,
    text: `w${i}`,
    startMs,
    endMs,
    state: 'final' as const,
    correctionId: null,
  })),
  ...extra,
});

const pick = (segments: TranscriptSegment[], gaps: TimelineGap[] = [], list = speakers) =>
  chooseClip('p-1', segments, list, gaps);

describe('chooseClip', () => {
  it('takes a passage of 4 to 10 seconds with its words', () => {
    const clip = pick([seg('s1', 'a', 40_000, 46_000, 3)]);
    expect(clip).toEqual({ startMs: 40_000, endMs: 46_000, track: 'meeting', text: 'w0 w1 w2' });
  });

  it('skips passages that are too short, too long or in the first 30 seconds', () => {
    expect(pick([seg('s1', 'a', 40_000, 43_000)])).toBeNull();
    expect(pick([seg('s1', 'a', 40_000, 50_500)])).toBeNull();
    expect(pick([seg('s1', 'a', 20_000, 26_000)])).toBeNull();
  });

  it('skips a passage that another speaker overlaps', () => {
    const segments = [seg('s1', 'a', 40_000, 46_000), seg('s2', 'b', 45_000, 47_000)];
    expect(pick(segments)).toBeNull();
  });

  it('skips a passage with a pause or missing audio inside', () => {
    const segment = seg('s1', 'a', 40_000, 46_000);
    const gap = (track: TimelineGap['track']): TimelineGap => ({
      kind: 'paused',
      track,
      startMs: 43_000,
      endMs: 44_000,
    });
    expect(pick([segment], [gap('both')])).toBeNull();
    expect(pick([segment], [gap('meeting')])).toBeNull();
    expect(pick([segment], [gap('microphone')])).not.toBeNull();
  });

  it('gives nothing when two speakers carry the profile or none does', () => {
    const two = [...speakers, { id: 'c', label: 'Cy', kind: 'unknown' as const, profileId: 'p-1' }];
    expect(pick([seg('s1', 'a', 40_000, 46_000)], [], two)).toBeNull();
    expect(chooseClip('p-9', [seg('s1', 'a', 40_000, 46_000)], speakers, [])).toBeNull();
  });

  it('prefers more words and fewer corrected words, and is deterministic', () => {
    const corrected = seg('s2', 'a', 60_000, 66_000, 20);
    corrected.words = corrected.words.map((word, i) =>
      i < 8 ? { ...word, state: 'corrected' as const, correctionId: 'c1' } : word,
    );
    const segments = [
      seg('s1', 'a', 40_000, 46_000, 10),
      corrected,
      seg('s3', 'a', 80_000, 86_000, 10),
    ];
    const first = pick(segments);
    expect(first?.startMs).toBe(40_000);
    expect(pick([...segments].reverse())).toEqual(first);
  });

  it('uses the microphone track for the user own profile', () => {
    const mic = seg('s1', 'you', 40_000, 46_000, 5, { track: 'microphone' });
    expect(chooseClip('p-you', [mic], speakers, [])?.track).toBe('microphone');
  });
});
