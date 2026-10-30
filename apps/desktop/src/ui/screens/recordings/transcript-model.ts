import type { Speaker, TimelineGap, TranscriptChanged, TranscriptSegment } from '@scrb/contracts';

export type TranscriptRow =
  | { kind: 'segment'; key: string; segment: TranscriptSegment }
  | { kind: 'gap'; key: string; gap: TimelineGap };

/** Applies one change to a loaded transcript. Returns a new array, in timeline order. */
export function applyTranscriptChange(
  segments: TranscriptSegment[],
  change: TranscriptChanged['change'],
): TranscriptSegment[] {
  switch (change.kind) {
    case 'append':
      return [...segments, ...change.segments];
    case 'replace': {
      const removed = new Set([
        ...change.removedSegmentIds,
        ...change.segments.map((segment) => segment.id),
      ]);
      return [...segments.filter((segment) => !removed.has(segment.id)), ...change.segments].sort(
        (a, b) => a.startMs - b.startMs,
      );
    }
    case 'realign': {
      const timing = new Map(change.words.map((word) => [word.id, word]));
      return segments.map((segment) =>
        segment.words.some((word) => timing.has(word.id))
          ? {
              ...segment,
              words: segment.words.map((word) => ({ ...word, ...timing.get(word.id) })),
            }
          : segment,
      );
    }
  }
}

export function mergeSpeakers(current: Speaker[], changed: Speaker[]): Speaker[] {
  const ids = new Set(changed.map((speaker) => speaker.id));
  return [...current.filter((speaker) => !ids.has(speaker.id)), ...changed];
}

/** Puts each gap in the transcript where it happened. */
export function buildRows(segments: TranscriptSegment[], gaps: TimelineGap[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let next = 0;
  const pushGapsBefore = (ms: number) => {
    for (; next < gaps.length && (gaps[next] as TimelineGap).startMs <= ms; next += 1) {
      rows.push({ kind: 'gap', key: `gap-${next}`, gap: gaps[next] as TimelineGap });
    }
  };
  for (const segment of segments) {
    pushGapsBefore(segment.startMs);
    rows.push({ kind: 'segment', key: segment.id, segment });
  }
  pushGapsBefore(Number.POSITIVE_INFINITY);
  return rows;
}

/** The last row that starts at or before `ms`, or 0. */
export function rowIndexAt(rows: TranscriptRow[], ms: number): number {
  let low = 0;
  let high = rows.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const row = rows[middle] as TranscriptRow;
    const start = row.kind === 'segment' ? row.segment.startMs : row.gap.startMs;
    if (start <= ms) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
