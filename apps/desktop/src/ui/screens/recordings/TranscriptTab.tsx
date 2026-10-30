import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from 'react';
import type { Speaker, TimelineGap, TranscriptSegment } from '@scrb/contracts';
import { formatElapsed } from '../../lib/format.ts';
import { buildRows, rowIndexAt, type TranscriptRow } from './transcript-model.ts';
import type { TranscriptData } from './use-transcript.ts';
import styles from './recordings.module.css';

const ESTIMATED_ROW_PX = 72;
const OVERSCAN_PX = 800;
const DEFAULT_VIEWPORT_PX = 600;

const GAP_LABELS: Record<TimelineGap['kind'], string> = {
  paused: 'Paused',
  audioMissing: 'Audio missing',
  computerAsleep: 'Computer asleep',
};

export function gapLabel(gap: TimelineGap): string {
  return `${GAP_LABELS[gap.kind]}, ${formatElapsed(gap.startMs)} to ${formatElapsed(gap.endMs)}`;
}

const WORD_CLASSES = {
  provisional: styles.wordProvisional,
  final: undefined,
  corrected: styles.wordCorrected,
};

interface SegmentRowProps {
  segment: TranscriptSegment;
  speaker: string;
  active: boolean;
  onPlay(ms: number): void;
  ref: Ref<HTMLDivElement>;
  rowKey: string;
}

const SegmentRow = memo(function SegmentRow({
  segment,
  speaker,
  active,
  onPlay,
  ref,
  rowKey,
}: SegmentRowProps) {
  const onClick = (event: MouseEvent) => {
    const ms = (event.target as HTMLElement).dataset['ms'];
    // Dragging across words selects text; that must not start the audio.
    if (ms !== undefined && window.getSelection()?.isCollapsed !== false) onPlay(Number(ms));
  };
  return (
    <div
      ref={ref}
      data-row={rowKey}
      className={active ? styles.segmentActive : styles.segment}
      aria-current={active ? 'true' : undefined}
    >
      <div className={styles.segmentHead}>
        <span className={styles.speaker}>{speaker}</span>
        <button
          type="button"
          className={styles.timeLink}
          aria-label={`Play from ${formatElapsed(segment.startMs)}`}
          onClick={() => onPlay(segment.startMs)}
        >
          {formatElapsed(segment.startMs)}
        </button>
      </div>
      {/* The timestamp button is the keyboard route to the same action. */}
      <p className={styles.words} onClick={onClick}>
        {segment.words.map((word) => (
          <span key={word.id}>
            <span data-ms={word.startMs} className={WORD_CLASSES[word.state]}>
              {word.text}
            </span>{' '}
          </span>
        ))}
      </p>
    </div>
  );
});

function GapRow({
  gap,
  rowKey,
  ref,
}: {
  gap: TimelineGap;
  rowKey: string;
  ref: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} data-row={rowKey} className={styles.gapRow}>
      {gapLabel(gap)}
    </div>
  );
}

function firstRowAt(offsets: Float64Array, top: number): number {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((offsets[middle] as number) <= top) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, low);
}

export interface JumpTarget {
  ms: number;
  nonce: number;
}

interface TranscriptTabProps {
  transcript: TranscriptData;
  gaps: TimelineGap[];
  fontPx: number;
  positionMs: number;
  showPosition: boolean;
  jump: JumpTarget | null;
  onPlay(ms: number): void;
}

export function TranscriptTab(props: TranscriptTabProps) {
  const { transcript, gaps, fontPx, positionMs, showPosition, jump, onPlay } = props;
  const { segments, speakers, totalSegments, loading, error } = transcript;
  const scroller = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportPx, setViewportPx] = useState(DEFAULT_VIEWPORT_PX);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());

  const rows = useMemo(() => buildRows(segments, gaps), [segments, gaps]);
  const labels = useMemo(
    () => new Map(speakers.map((speaker: Speaker) => [speaker.id, speaker.label])),
    [speakers],
  );
  const offsets = useMemo(() => {
    const values = new Float64Array(rows.length + 1);
    rows.forEach((row: TranscriptRow, index) => {
      values[index + 1] = (values[index] as number) + (heights.get(row.key) ?? ESTIMATED_ROW_PX);
    });
    return values;
  }, [rows, heights]);
  const layout = useRef({ rows, offsets, heights });

  useEffect(() => {
    layout.current = { rows, offsets, heights };
  }, [rows, offsets, heights]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const rowObserver = new ResizeObserver((entries) => {
      const current = layout.current;
      const next = new Map(current.heights);
      const element = scroller.current;
      let shiftAbove = 0;
      let changed = false;
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset['row'] as string;
        const height = (entry.target as HTMLElement).offsetHeight;
        const previous = next.get(key) ?? ESTIMATED_ROW_PX;
        if (height === previous) continue;
        next.set(key, height);
        changed = true;
        // Rows above the viewport must not push the text being read.
        const index = current.rows.findIndex((row) => row.key === key);
        if (element && index >= 0 && (current.offsets[index] as number) < element.scrollTop) {
          shiftAbove += height - previous;
        }
      }
      if (!changed) return;
      layout.current = { ...current, heights: next };
      setHeights(next);
      if (element && shiftAbove !== 0) element.scrollTop += shiftAbove;
    });
    const viewportObserver = new ResizeObserver(([entry]) => {
      if (entry) setViewportPx(entry.contentRect.height);
    });
    observer.current = rowObserver;
    if (scroller.current) viewportObserver.observe(scroller.current);
    return () => {
      rowObserver.disconnect();
      viewportObserver.disconnect();
      observer.current = null;
    };
  }, []);

  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return undefined;
    const rowObserver = observer.current;
    rowObserver?.observe(element);
    return () => rowObserver?.unobserve(element);
  }, []);

  const handled = useRef<number | null>(null);
  const lastStart = segments.at(-1)?.startMs ?? -1;
  useEffect(() => {
    if (!jump || handled.current === jump.nonce || !scroller.current) return;
    if (jump.ms > lastStart && loading) return;
    handled.current = jump.nonce;
    scroller.current.scrollTop = offsets[rowIndexAt(rows, jump.ms)] ?? 0;
  }, [jump, lastStart, loading, offsets, rows]);

  if (error) return <p role="alert">{error}</p>;
  if (!loading && rows.length === 0) {
    return <p className={styles.muted}>There is no transcript text yet.</p>;
  }

  const unloaded = Math.max(0, totalSegments - segments.length) * ESTIMATED_ROW_PX;
  const contentHeight = (offsets[rows.length] as number) + unloaded;
  const first = firstRowAt(offsets, scrollTop - OVERSCAN_PX);
  let end = first;
  while (end < rows.length && (offsets[end] as number) < scrollTop + viewportPx + OVERSCAN_PX) {
    end += 1;
  }
  const activeIndex = showPosition ? rowIndexAt(rows, positionMs) : -1;

  return (
    <div
      ref={scroller}
      className={styles.transcript}
      style={{ fontSize: fontPx }}
      tabIndex={0}
      role="region"
      aria-label="Transcript"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: contentHeight }}>
        <div style={{ transform: `translateY(${offsets[first] ?? 0}px)` }}>
          {rows
            .slice(first, end)
            .map((row, index) =>
              row.kind === 'gap' ? (
                <GapRow key={row.key} ref={measure} rowKey={row.key} gap={row.gap} />
              ) : (
                <SegmentRow
                  key={row.key}
                  ref={measure}
                  rowKey={row.key}
                  segment={row.segment}
                  speaker={labels.get(row.segment.speakerId) ?? 'Unknown speaker'}
                  active={first + index === activeIndex}
                  onPlay={onPlay}
                />
              ),
            )}
        </div>
      </div>
      {loading && (
        <p role="status" className={styles.srOnly}>
          Loading the transcript…
        </p>
      )}
    </div>
  );
}
