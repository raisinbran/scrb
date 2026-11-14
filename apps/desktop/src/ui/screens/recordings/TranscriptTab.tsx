import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type Ref,
} from 'react';
import type { Speaker, TimelineGap, TranscriptSegment } from '@scrb/contracts';
import { formatElapsed } from '../../lib/format.ts';
import { recall, remember } from '../../lib/tab-memory.ts';
import { ContextMenu } from '../../components/ContextMenu.tsx';
import { CorrectionEditor } from '../live/CorrectionEditor.tsx';
import { buildRows, currentWordId, rowIndexAt, type TranscriptRow } from './transcript-model.ts';
import type { TranscriptData } from './use-transcript.ts';
import styles from './recordings.module.css';

const ESTIMATED_ROW_PX = 72;
const OVERSCAN_PX = 800;
const DEFAULT_VIEWPORT_PX = 600;
/** Room kept above the current row when following, so the line before it stays visible. */
const FOLLOW_MARGIN_PX = 24;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

const TRACK_NAMES: Record<TimelineGap['track'], string> = {
  microphone: 'Microphone audio',
  meeting: 'Meeting audio',
  both: 'Audio',
};

function gapName(gap: TimelineGap): string {
  switch (gap.kind) {
    case 'paused':
      return 'Paused';
    case 'computerAsleep':
      return 'Computer asleep';
    case 'possiblyMissing':
      return `${TRACK_NAMES[gap.track]} may be missing`;
    case 'audioMissing':
      return `${TRACK_NAMES[gap.track]} missing`;
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest(`[${EDITOR_MARK}]`)) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The start rounds down and the end up, so a short gap is never shown as a zero-length range. */
export function gapLabel(gap: TimelineGap): string {
  const from = formatElapsed(gap.startMs);
  const to = formatElapsed(Math.ceil(gap.endMs / 1000) * 1000);
  return from === to ? `${gapName(gap)}, at ${from}` : `${gapName(gap)}, ${from} to ${to}`;
}

const WORD_CLASSES = {
  provisional: styles.wordProvisional,
  final: undefined,
  corrected: styles.wordCorrected,
};

export const EDITOR_MARK = 'data-editor';
const MAX_NAME_LENGTH = 60;

/** The message to show for a name that cannot be used, or null when it is fine. */
export function nameProblem(name: string, others: string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  if (trimmed.length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters.`;
  const lower = trimmed.toLowerCase();
  if (others.some((other) => other.trim().toLowerCase() === lower)) {
    return 'Another speaker in this meeting already has that name.';
  }
  return null;
}

interface SpeakerRenameProps {
  current: string;
  others: string[];
  onSave(name: string): Promise<void>;
  onCancel(): void;
}

function SpeakerRename({ current, others, onSave, onCancel }: SpeakerRenameProps) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === current) {
      onCancel();
      return;
    }
    const problem = nameProblem(trimmed, others);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
    } catch (failure) {
      setSaving(false);
      setError(failure instanceof Error ? failure.message : 'The name could not be saved.');
    }
  };

  return (
    <form
      {...{ [EDITOR_MARK]: '' }}
      className={styles.renameForm}
      aria-label="Rename speaker"
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') onCancel();
      }}
    >
      <input
        ref={input}
        className={styles.input}
        aria-label="Speaker name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className={styles.primary} disabled={saving}>
        Save
      </button>
      <button type="button" className={styles.button} onClick={onCancel}>
        Cancel
      </button>
      {error && <span role="alert">{error}</span>}
    </form>
  );
}

interface SegmentRowProps {
  segment: TranscriptSegment;
  speaker: string;
  active: boolean;
  following: boolean;
  currentWord: string | undefined;
  onPlay(ms: number): void;
  onPlace: (ms: number, wordId: string, rowKey: string) => void;
  /** Absent when the meeting cannot be edited. */
  onEditWord: ((wordId: string) => void) | undefined;
  onStartRename: ((speakerId: string, rowKey: string) => void) | undefined;
  renaming: boolean;
  otherNames: string[];
  onSaveRename(name: string): Promise<void>;
  onCancelRename(): void;
  ref: Ref<HTMLDivElement>;
  rowKey: string;
}

const SegmentRow = memo(function SegmentRow({
  segment,
  speaker,
  active,
  following,
  currentWord,
  onPlay,
  onPlace,
  onEditWord,
  onStartRename,
  renaming,
  otherNames,
  onSaveRename,
  onCancelRename,
  ref,
  rowKey,
}: SegmentRowProps) {
  const onDoubleClick = (event: MouseEvent) => {
    const id = (event.target as HTMLElement).dataset['word'];
    if (id !== undefined) onEditWord?.(id);
  };
  const onClick = (event: MouseEvent) => {
    const ms = (event.target as HTMLElement).dataset['ms'];
    // A word click only moves the playhead; playing is the timestamp button's job.
    // Dragging across words selects text and must not move it.
    const wordId = (event.target as HTMLElement).dataset['word'];
    if (ms !== undefined && wordId !== undefined && window.getSelection()?.isCollapsed !== false) {
      onPlace(Number(ms), wordId, rowKey);
    }
  };
  return (
    <div
      ref={ref}
      data-row={rowKey}
      className={active ? styles.segmentActive : styles.segment}
      aria-current={active ? 'true' : undefined}
    >
      <div className={styles.segmentHead}>
        {renaming ? (
          <SpeakerRename
            current={speaker}
            others={otherNames}
            onSave={onSaveRename}
            onCancel={onCancelRename}
          />
        ) : onStartRename ? (
          <button
            type="button"
            className={styles.speakerButton}
            aria-label={`Rename speaker ${speaker}`}
            onClick={() => onStartRename(segment.speakerId, rowKey)}
          >
            {speaker}
          </button>
        ) : (
          <span className={styles.speaker}>{speaker}</span>
        )}
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
      <p
        className={following ? `${styles.words} ${styles.wordsFollowing}` : styles.words}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {segment.words.map((word) => (
          <span key={word.id}>
            <span
              data-ms={word.startMs}
              data-word={word.id}
              className={
                word.id === currentWord
                  ? [WORD_CLASSES[word.state], styles.wordCurrent].filter(Boolean).join(' ')
                  : WORD_CLASSES[word.state]
              }
              aria-current={word.id === currentWord ? 'true' : undefined}
            >
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

function isRendered(
  rows: TranscriptRow[],
  offsets: Float64Array,
  scrollTop: number,
  viewportPx: number,
  key: string,
): boolean {
  const { first, end } = renderedRange(offsets, rows.length, scrollTop, viewportPx);
  return rows.slice(first, end).some((row) => row.key === key);
}

/** The row being spoken at `ms`; with overlapping speakers a later-starting row may already be over. */
function activeRowAt(rows: TranscriptRow[], ms: number): number {
  const latest = rowIndexAt(rows, ms);
  for (let index = latest; index >= Math.max(0, latest - 30); index -= 1) {
    const row = rows[index];
    if (row?.kind === 'segment' && currentWordId(row.segment, ms) !== undefined) return index;
  }
  return latest;
}

function renderedRange(
  offsets: Float64Array,
  count: number,
  scrollTop: number,
  viewportPx: number,
) {
  const first = firstRowAt(offsets, scrollTop - OVERSCAN_PX);
  let end = first;
  while (end < count && (offsets[end] as number) < scrollTop + viewportPx + OVERSCAN_PX) end += 1;
  return { first, end };
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
  /** Audio is playing, so the list keeps the current row in view until the reader scrolls away. */
  playing?: boolean;
  jump: JumpTarget | null;
  onPlay(ms: number): void;
  /** Moves the playhead to a clicked word's start. It must not start or pause audio. */
  onPlace(ms: number): void;
  /** Present only when the meeting can be edited. */
  editing?: TranscriptEditing | undefined;
  onEditorOpenChange?(open: boolean): void;
  /** Names the meeting whose reading position is kept while another tab is open. */
  restoreKey?: string;
}

export interface TranscriptEditing {
  /** Corrects the words from the first id to the last, which may be the same word. */
  correctRange(
    firstWordId: string,
    lastWordId: string,
    text: string,
    remember: boolean,
  ): Promise<void>;
  renameSpeaker(speakerId: string, name: string): Promise<void>;
}

export function TranscriptTab(props: TranscriptTabProps) {
  const {
    transcript,
    gaps,
    fontPx,
    positionMs,
    showPosition,
    playing = false,
    jump,
    onPlay,
    onPlace,
    editing,
    onEditorOpenChange,
    restoreKey,
  } = props;
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

  const onRowResize = useCallback((entries: ResizeObserverEntry[]) => {
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
  }, []);

  // Only the reader's own wheel, touch, scrollbar or keys stop following; scrolling done here
  // never does, so the tracking cannot switch itself off.
  const [followPlayback, setFollowPlayback] = useState(true);
  const stopFollowing = useCallback(() => setFollowPlayback(false), []);
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (playing && !wasPlaying.current) setFollowPlayback(true);
    wasPlaying.current = playing;
  }, [playing]);

  const showList = !error && (loading || rows.length > 0);
  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const viewportObserver = new ResizeObserver(([entry]) => {
      if (entry) setViewportPx(entry.contentRect.height);
    });
    viewportObserver.observe(element);
    return () => viewportObserver.disconnect();
  }, [showList]);

  const measure = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return undefined;
      // Created here: rows already loaded attach during commit, before any effect runs.
      if (!observer.current && typeof ResizeObserver !== 'undefined') {
        observer.current = new ResizeObserver(onRowResize);
      }
      const rowObserver = observer.current;
      rowObserver?.observe(element);
      return () => rowObserver?.unobserve(element);
    },
    [onRowResize],
  );

  const handled = useRef<number | null>(null);
  const lastStart = segments.at(-1)?.startMs ?? -1;
  useEffect(() => {
    if (!jump || handled.current === jump.nonce || !scroller.current) return;
    if (jump.ms > lastStart && loading) return;
    handled.current = jump.nonce;
    scroller.current.scrollTop = offsets[rowIndexAt(rows, jump.ms)] ?? 0;
  }, [jump, lastStart, loading, offsets, rows]);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !scroller.current || loading) return;
    restored.current = true;
    const saved = restoreKey && !jump ? recall<number>(`scroll.${restoreKey}`) : undefined;
    if (saved) scroller.current.scrollTop = saved;
  }, [jump, loading, restoreKey, showList]);

  // Overlapping speakers make the time alone ambiguous, so the clicked word itself stays current
  // for as long as the playhead is where the click put it.
  const [placed, setPlaced] = useState<{ wordId: string; rowKey: string; ms: number } | null>(null);
  const onPlaceWord = useCallback(
    (ms: number, wordId: string, rowKey: string) => {
      setPlaced({ wordId, rowKey, ms });
      onPlace(ms);
    },
    [onPlace],
  );
  const [editWord, setEditWord] = useState<{ id: string; lastId: string; text: string } | null>(
    null,
  );
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    /** What Copy puts on the clipboard. */
    text: string;
    /** The model words under the selection, which Correct text starts from. */
    words: string;
    first: string;
    last: string;
  } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** Closing the editor also drops the text highlight the double-click left behind. */
  const closeEditor = useCallback(() => {
    setEditWord(null);
    window.getSelection()?.removeAllRanges();
  }, []);
  const editorShown = editWord !== null;
  useEffect(() => {
    if (!editorShown) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(`[${EDITOR_MARK}]`)) closeEditor();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [editorShown, closeEditor]);
  const [renaming, setRenaming] = useState<{ speakerId: string; rowKey: string } | null>(null);
  const renamingId = renaming?.speakerId ?? null;
  // The rename form lives in its row. While that row is outside the rendered range the form is
  // gone, so it must not keep the playback keys off.
  const renamingRowKey = renaming?.rowKey;
  const renamingShown =
    renamingRowKey !== undefined &&
    isRendered(rows, offsets, scrollTop, viewportPx, renamingRowKey);
  const editorOpen = editWord !== null || renamingShown;
  useEffect(() => {
    onEditorOpenChange?.(editorOpen);
    return () => onEditorOpenChange?.(false);
  }, [editorOpen, onEditorOpenChange]);
  const canEdit = editing !== undefined;
  const onEditWord = useCallback(
    (id: string) => {
      const word = segments.flatMap((segment) => segment.words).find((item) => item.id === id);
      if (word) {
        setRenaming(null);
        setEditWord({ id, lastId: id, text: word.text });
      }
    },
    [segments],
  );
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    const wordAt = (event.target as HTMLElement).closest<HTMLElement>('[data-word]');
    const selection = window.getSelection();
    const inWords = (element: HTMLElement) =>
      selection !== null &&
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      selection.getRangeAt(0).intersectsNode(element);
    if (wordAt && !inWords(wordAt)) {
      // Right-clicking a word outside the selection acts on that word, as in a text editor.
      selection?.selectAllChildren(wordAt);
    }
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const hit = [...root.querySelectorAll<HTMLElement>('[data-word]')].filter(inWords);
    const first = hit[0]?.dataset['word'];
    const last = hit.at(-1)?.dataset['word'];
    if (!first || !last) return;
    event.preventDefault();
    const ids = segments.flatMap((segment) => segment.words);
    const from = ids.findIndex((item) => item.id === first);
    const to = ids.findIndex((item) => item.id === last);
    const words = from >= 0 && to >= from ? ids.slice(from, to + 1) : [];
    setMenu({
      x: event.clientX,
      y: event.clientY,
      text: selection.toString(),
      first,
      last,
      words: words.map((item) => item.text).join(' '),
    });
  };
  const onStartRename = useCallback((speakerId: string, rowKey: string) => {
    setEditWord(null);
    setRenaming({ speakerId, rowKey });
  }, []);
  const otherNames = useMemo(
    () => speakers.filter((speaker) => speaker.id !== renamingId).map((speaker) => speaker.label),
    [speakers, renamingId],
  );
  const onSaveRename = useCallback(
    async (name: string) => {
      if (!editing || renamingId === null) return;
      await editing.renameSpeaker(renamingId, name);
      setRenaming(null);
    },
    [editing, renamingId],
  );
  const onCancelRename = useCallback(() => setRenaming(null), []);

  const placedNow = showPosition && placed?.ms === positionMs ? placed : null;
  const placedIndex = placedNow ? rows.findIndex((row) => row.key === placedNow.rowKey) : -1;
  const activeIndex = !showPosition
    ? -1
    : placedIndex >= 0
      ? placedIndex
      : activeRowAt(rows, positionMs);
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing || !followPlayback || activeIndex < 0) return;
    const { offsets: tops } = layout.current;
    const top = tops[activeIndex];
    const bottom = tops[activeIndex + 1];
    if (top === undefined || bottom === undefined) return;
    if (top >= element.scrollTop && bottom <= element.scrollTop + element.clientHeight) return;
    const target = Math.max(0, top - FOLLOW_MARGIN_PX);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
    } else element.scrollTop = target;
  }, [playing, followPlayback, activeIndex, viewportPx]);

  const unloaded = Math.max(0, totalSegments - segments.length) * ESTIMATED_ROW_PX;
  const contentHeight = (offsets[rows.length] as number) + unloaded;
  const { first, end } = renderedRange(offsets, rows.length, scrollTop, viewportPx);
  if (error) return <p role="alert">{error}</p>;
  if (!showList) {
    return <p className={styles.muted}>There is no transcript text yet.</p>;
  }

  return (
    <div className={styles.transcriptBox}>
      <div
        ref={scroller}
        className={styles.transcript}
        style={{ fontSize: fontPx }}
        tabIndex={0}
        role="region"
        aria-label="Transcript"
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
          if (restoreKey && restored.current)
            remember(`scroll.${restoreKey}`, event.currentTarget.scrollTop);
        }}
        onContextMenu={onContextMenu}
        onWheel={stopFollowing}
        onTouchMove={stopFollowing}
        onPointerDown={(event) => {
          // A press on the scroller itself is its scrollbar; the rows handle their own clicks.
          if (event.target === event.currentTarget) stopFollowing();
        }}
        onKeyDown={(event) => {
          // Keys bubble from a focused timestamp or speaker button too, and they scroll the list.
          if (SCROLL_KEYS.has(event.key) && !isTextEntry(event.target)) stopFollowing();
        }}
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
                    following={showPosition}
                    currentWord={
                      showPosition && first + index === activeIndex
                        ? placedIndex >= 0 && placedNow
                          ? placedNow.wordId
                          : currentWordId(row.segment, positionMs)
                        : undefined
                    }
                    onPlay={onPlay}
                    onPlace={onPlaceWord}
                    onEditWord={canEdit ? onEditWord : undefined}
                    onStartRename={canEdit ? onStartRename : undefined}
                    renaming={renaming?.rowKey === row.key}
                    otherNames={otherNames}
                    onSaveRename={onSaveRename}
                    onCancelRename={onCancelRename}
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
      {!followPlayback && showPosition && (
        <button
          type="button"
          className={styles.jumpToPosition}
          onClick={() => {
            setFollowPlayback(true);
            const element = scroller.current;
            const top = offsets[activeIndex];
            if (element && top !== undefined) {
              element.scrollTop = Math.max(0, top - FOLLOW_MARGIN_PX);
            }
            element?.focus();
          }}
        >
          Jump to current position
        </button>
      )}
      {editing && editWord && (
        <div {...{ [EDITOR_MARK]: '' }}>
          <CorrectionEditor
            originalText={editWord.text}
            top={8}
            onApply={async (text, remember) => {
              await editing.correctRange(editWord.id, editWord.lastId, text, remember);
              closeEditor();
            }}
            onCancel={closeEditor}
          />
        </div>
      )}
      {menu && (
        <ContextMenu
          label="Transcript text"
          at={menu}
          onClose={closeMenu}
          items={[
            {
              label: 'Copy',
              onSelect: () => {
                void navigator.clipboard?.writeText(menu.text);
              },
            },
            ...(editing
              ? [
                  {
                    label: 'Correct text',
                    onSelect: () => {
                      setRenaming(null);
                      setEditWord({ id: menu.first, lastId: menu.last, text: menu.words });
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
