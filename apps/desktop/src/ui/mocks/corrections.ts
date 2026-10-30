import type { TranscriptSegment, TranscriptWord, WordRange } from '@scrb/contracts';

/** A reversible change: the segments as they were, and as they became. */
export interface TranscriptEdit {
  before: TranscriptSegment[];
  after: TranscriptSegment[];
}

export function finalizeProvisionalWords(
  segment: TranscriptSegment | undefined,
): TranscriptSegment | null {
  if (!segment?.words.some((word) => word.state === 'provisional')) return null;
  return {
    ...segment,
    words: segment.words.map((word) =>
      word.state === 'provisional' ? { ...word, state: 'final' } : word,
    ),
  };
}

/**
 * Puts all of `text` where the range's first word was. Later words of the range are removed, and a
 * segment left with no words disappears. Returns null when the range is not in `segments`.
 */
export function correctWordRange(
  segments: TranscriptSegment[],
  range: WordRange,
  text: string,
  correctionId: string,
): (TranscriptEdit & { originalText: string }) | null {
  const firstIndex = segments.findIndex((segment) =>
    segment.words.some((word) => word.id === range.firstWordId),
  );
  const lastIndex = segments.findIndex((segment) =>
    segment.words.some((word) => word.id === range.lastWordId),
  );
  if (firstIndex < 0 || lastIndex < firstIndex) return null;

  const before = segments.slice(firstIndex, lastIndex + 1);
  const selected: TranscriptWord[] = [];
  const after = before.map((segment, index) => {
    const start =
      index === 0 ? segment.words.findIndex((word) => word.id === range.firstWordId) : 0;
    const end =
      index === before.length - 1
        ? segment.words.findIndex((word) => word.id === range.lastWordId)
        : segment.words.length - 1;
    selected.push(...segment.words.slice(start, end + 1));
    return { segment, start, end };
  });

  const first = selected[0] as TranscriptWord;
  const last = selected.at(-1) as TranscriptWord;
  const texts = text.trim().split(/\s+/);
  const spanMs = (last.endMs - first.startMs) / texts.length;
  const replacement = texts.map((wordText, index) => ({
    id: selected[index]?.id ?? `${correctionId}-w-${index}`,
    text: wordText,
    startMs: Math.round(first.startMs + index * spanMs),
    endMs: Math.round(first.startMs + (index + 1) * spanMs),
    state: 'corrected' as const,
    correctionId,
  }));

  const rebuilt = after
    .map(({ segment, start, end }, index) => ({
      ...segment,
      words: [
        ...segment.words.slice(0, start),
        ...(index === 0 ? replacement : []),
        ...segment.words.slice(end + 1),
      ],
    }))
    .filter((segment) => segment.words.length > 0);

  return {
    before,
    after: rebuilt,
    originalText: selected.map((word) => word.text).join(' '),
  };
}
