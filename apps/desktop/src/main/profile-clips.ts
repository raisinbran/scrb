import type {
  ProfileClip,
  Speaker,
  TimelineGap,
  TranscriptSegment,
  TrackKind,
} from '@scrb/contracts';

export const MIN_CLIP_MS = 4000;
export const MAX_CLIP_MS = 10_000;
/** Openings often hold greetings and setup noise. */
export const SKIP_START_MS = 30_000;
export const MAX_CLIPS = 3;

type Choice = Pick<ProfileClip, 'startMs' | 'endMs' | 'track' | 'text'>;

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/**
 * The best single-voice passage of one profile in one meeting, or null. The same input always gives
 * the same passage. A meeting where two speakers carry the profile is ambiguous and gives nothing.
 */
export function chooseClip(
  profileId: string,
  segments: readonly TranscriptSegment[],
  speakers: readonly Speaker[],
  gaps: readonly TimelineGap[],
): Choice | null {
  const own = speakers.filter((speaker) => speaker.profileId === profileId);
  if (own.length !== 1) return null;
  const speakerId = own[0]?.id;
  const others = segments.filter((segment) => segment.speakerId !== speakerId);
  let best: { segment: TranscriptSegment; score: number } | null = null;
  for (const segment of segments) {
    if (segment.speakerId !== speakerId) continue;
    const length = segment.endMs - segment.startMs;
    if (length < MIN_CLIP_MS || length > MAX_CLIP_MS || segment.startMs < SKIP_START_MS) continue;
    if (
      others.some((other) => overlaps(segment.startMs, segment.endMs, other.startMs, other.endMs))
    ) {
      continue;
    }
    const gapped = gaps.some(
      (gap) =>
        (gap.track === 'both' || gap.track === segment.track) &&
        overlaps(segment.startMs, segment.endMs, gap.startMs, gap.endMs),
    );
    if (gapped) continue;
    // More words are better; a corrected word is a sign the recognizer was unsure.
    const corrected = segment.words.filter((word) => word.state === 'corrected').length;
    const score = segment.words.length - 2 * corrected;
    const better =
      best === null ||
      score > best.score ||
      (score === best.score &&
        (segment.startMs < best.segment.startMs ||
          (segment.startMs === best.segment.startMs && segment.id < best.segment.id)));
    if (better) best = { segment, score };
  }
  if (!best) return null;
  const { segment } = best;
  const track: TrackKind = segment.track;
  return {
    startMs: segment.startMs,
    endMs: segment.endMs,
    track,
    text: segment.words.map((word) => word.text).join(' '),
  };
}
