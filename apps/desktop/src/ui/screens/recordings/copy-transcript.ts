import type { Speaker, TranscriptSegment } from '@scrb/contracts';

export function formatTranscriptForCopy(
  segments: TranscriptSegment[],
  speakers: Speaker[],
): string {
  const labels = new Map(speakers.map((speaker) => [speaker.id, speaker.label]));
  return segments
    .map((segment, index) => ({ segment, index }))
    .sort(
      (a, b) =>
        a.segment.startMs - b.segment.startMs ||
        a.segment.endMs - b.segment.endMs ||
        a.index - b.index,
    )
    .map(({ segment }) => {
      const text = segment.words
        .map((word) => word.text)
        .join(' ')
        .trim();
      return text ? `${labels.get(segment.speakerId) ?? 'Unknown speaker'}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}
