import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { formatElapsed } from '../../lib/format.ts';
import { CorrectionEditor } from './CorrectionEditor.tsx';
import { TranscriptRow } from './TranscriptRow.tsx';
import { TranscriptStore, type WordPosition, type WordRef } from './transcript-store.ts';
import { usePlayback } from './use-playback.ts';
import { useUndo } from './use-undo.ts';
import {
  movePosition,
  rangeOf,
  resolveSelection,
  type CursorMove,
  type WordSelection,
} from './word-selection.ts';
import styles from './TranscriptView.module.css';

const OVERSCAN_ROWS = 6;
const STICK_TO_BOTTOM_PX = 48;
const FALLBACK_VIEWPORT_PX = 480;
const EDITOR_HEIGHT_PX = 176;
/** Long enough to tell a click, which plays audio, from the first half of a double-click. */
const CLICK_DELAY_MS = 240;
const TEXT_GUTTER_PX = 32;
const MIN_FONT_PX = 12;
const MAX_FONT_PX = 28;

const CURSOR_KEYS: Record<string, CursorMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'lineStart',
  End: 'lineEnd',
};

export interface TranscriptViewHandle {
  jumpToLive(): void;
  undo(): void;
  redo(): void;
}

interface TranscriptViewProps {
  meetingId: MeetingId;
  fontPx: number;
  onFontChange(fontPx: number): void;
  ref?: Ref<TranscriptViewHandle>;
}

function wordAt(target: EventTarget | null): { segmentId: string; wordId: string } | null {
  if (!(target instanceof Element)) return null;
  const word = target.closest<HTMLElement>('[data-word-id]');
  const row = word?.closest<HTMLElement>('[data-segment-id]');
  const wordId = word?.dataset['wordId'];
  const segmentId = row?.dataset['segmentId'];
  return wordId && segmentId ? { wordId, segmentId } : null;
}

export function TranscriptView({ meetingId, fontPx, onFontChange, ref }: TranscriptViewProps) {
  const backend = useBackend();
  const [store] = useState(() => new TranscriptStore(backend, meetingId));
  useEffect(() => store.start(), [store]);
  const version = useSyncExternalStore(store.subscribe, store.getVersion);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [following, setFollowing] = useState(true);
  const [measureTick, setMeasureTick] = useState(0);

  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [cursor, setCursor] = useState<WordRef | null>(null);
  const [editing, setEditing] = useState(false);

  const playback = usePlayback(meetingId);
  const undoState = useUndo(meetingId);
  const dragRef = useRef<{ anchor: WordRef; moved: boolean } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const reachedBottomByCode = useRef(false);

  useEffect(() => () => clearTimeout(clickTimer.current), []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rowCount = store.rowCount;
  const viewportHeight = viewport.height || FALLBACK_VIEWPORT_PX;
  store.heights.setLayout({
    widthPx: Math.max((viewport.width || 700) - TEXT_GUTTER_PX, 200),
    fontPx,
  });
  const firstVisible = store.heights.indexAt(scrollTop, rowCount);
  const lastVisible = store.heights.indexAt(scrollTop + viewportHeight, rowCount);
  const firstRow = Math.max(firstVisible - OVERSCAN_ROWS, 0);
  const lastRow = Math.min(lastVisible + OVERSCAN_ROWS, rowCount - 1);
  const totalHeight = store.heights.totalHeight(rowCount);

  useEffect(() => {
    store.ensureRange(firstRow, lastRow);
  }, [store, firstRow, lastRow, version]);

  // Selected words are tracked by id, so only a rewrite of those very words can move them.
  const liveSelection = useMemo(
    () => (selection ? resolveSelection(store, selection) : null),
    // `version` stands for the store's contents, which React cannot see.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, selection, version],
  );
  const range = useMemo(
    () => (liveSelection ? rangeOf(store, liveSelection) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, liveSelection, version],
  );
  const selectionLost = selection !== null && liveSelection === null;
  const cursorPosition = useMemo(
    () => (cursor ? store.positionOf(cursor) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, cursor, version],
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;
    let aboveViewport = 0;
    let changed = false;
    for (const row of canvas.querySelectorAll<HTMLElement>('[data-row-index]')) {
      const height = row.getBoundingClientRect().height;
      const index = Number(row.dataset['rowIndex']);
      const id = row.firstElementChild?.getAttribute('data-segment-id');
      if (!height || !id) continue;
      const delta = store.heights.measure(index, id, height);
      if (delta !== 0) changed = true;
      if (index < firstVisible) aboveViewport += delta;
    }
    if (aboveViewport !== 0 && !following) element.scrollTop += aboveViewport;
    if (changed) setMeasureTick((tick) => tick + 1);
  }, [store, version, firstRow, lastRow, firstVisible, following, fontPx, viewport, measureTick]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !following) return;
    const bottom = Math.max(totalHeight - element.clientHeight, 0);
    if (element.scrollTop !== bottom) {
      reachedBottomByCode.current = true;
      element.scrollTop = bottom;
      setScrollTop(element.scrollTop);
    }
  }, [following, totalHeight, viewport.height, measureTick]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    if (reachedBottomByCode.current) {
      reachedBottomByCode.current = false;
    } else {
      const gap = element.scrollHeight - element.scrollTop - element.clientHeight;
      setFollowing(gap < STICK_TO_BOTTOM_PX);
    }
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  };

  const scrollRowIntoView = (index: number) => {
    const element = scrollRef.current;
    if (!element) return;
    const top = store.heights.topOf(index, rowCount);
    const bottom = store.heights.topOf(index + 1, rowCount);
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  };

  const jumpToLive = useCallback(() => {
    setSelection(null);
    setEditing(false);
    setCursor(null);
    setFollowing(true);
    scrollRef.current?.focus();
  }, []);

  useImperativeHandle(ref, () => ({ jumpToLive, undo: undoState.undo, redo: undoState.redo }), [
    jumpToLive,
    undoState.undo,
    undoState.redo,
  ]);

  const startSelection = (next: WordSelection) => {
    setSelection(next);
    setCursor(next.focus);
    setFollowing(false);
  };

  const refFromEvent = (event: MouseEvent): WordRef | null => {
    const word = wordAt(event.target);
    const position = word && store.positionOf({ ...word, startMs: 0 });
    return position ? store.refAt(position) : null;
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const ref = refFromEvent(event);
    if (!ref) return;
    if (event.shiftKey && liveSelection) {
      startSelection({ anchor: liveSelection.anchor, focus: ref });
      dragRef.current = { anchor: liveSelection.anchor, moved: true };
      return;
    }
    dragRef.current = { anchor: ref, moved: false };
  };

  const onMouseMove = (event: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const focus = refFromEvent(event);
    if (!focus || (focus.wordId === drag.anchor.wordId && !drag.moved)) return;
    drag.moved = true;
    startSelection({ anchor: drag.anchor, focus });
  };

  const onMouseUp = (event: MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      setEditing(true);
      return;
    }
    if (event.detail > 1) return;
    const position = store.positionOf(drag.anchor);
    const word = position && store.segmentAt(position.segment)?.words[position.word];
    setSelection(null);
    setEditing(false);
    setCursor(drag.anchor);
    if (!word) return;
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => playback.play(word.startMs), CLICK_DELAY_MS);
  };

  const onDoubleClick = (event: MouseEvent) => {
    clearTimeout(clickTimer.current);
    const ref = refFromEvent(event);
    if (!ref) return;
    startSelection({ anchor: ref, focus: ref });
    setEditing(true);
  };

  const currentPosition = (): WordPosition | null => {
    if (cursorPosition) return cursorPosition;
    const rowWithText = following ? lastVisible : firstVisible;
    return store.segmentAt(rowWithText) ? { segment: rowWithText, word: 0 } : null;
  };

  const moveCursor = (move: CursorMove, extend: boolean) => {
    const from = currentPosition();
    const target = from && (cursor ? movePosition(store, from, move) : from);
    const next = target && store.refAt(target);
    if (!next) return;
    setFollowing(false);
    setCursor(next);
    scrollRowIntoView(next ? (store.positionOf(next)?.segment ?? 0) : 0);
    if (extend) {
      const anchor = liveSelection?.anchor ?? (from && store.refAt(from)) ?? next;
      setSelection({ anchor, focus: next });
    } else {
      setSelection(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const move = CURSOR_KEYS[event.key];
    if (move) {
      event.preventDefault();
      moveCursor(move, event.shiftKey);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const ref = liveSelection?.focus ?? (cursorPosition && cursor);
      if (!ref) return;
      if (!liveSelection) startSelection({ anchor: ref, focus: ref });
      setEditing(true);
    } else if (event.key === ' ') {
      event.preventDefault();
      const position = currentPosition();
      const word = position && store.segmentAt(position.segment)?.words[position.word];
      if (word) playback.play(word.startMs);
    } else if (event.key === 'Escape') {
      setSelection(null);
      playback.stop();
    }
  };

  const onCopy = (event: ClipboardEvent) => {
    if (!range) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', store.textBetween(range.first, range.last));
  };

  const closeEditor = () => {
    setEditing(false);
    scrollRef.current?.focus();
  };

  const applyCorrection = async (text: string, remember: boolean) => {
    if (!range) return;
    const first = store.refAt(range.first);
    const last = store.refAt(range.last);
    if (!first || !last) return;
    const next = await backend.call('applyCorrection', {
      meetingId,
      range: { firstWordId: first.wordId, lastWordId: last.wordId },
      text,
      remember,
    });
    undoState.record(next);
    setSelection(null);
    closeEditor();
  };

  const editorTop = () => {
    const anchorRow = range?.last.segment ?? 0;
    const below = store.heights.topOf(anchorRow + 1, rowCount) - scrollTop;
    const above = store.heights.topOf(range?.first.segment ?? 0, rowCount) - scrollTop;
    const room = viewportHeight - EDITOR_HEIGHT_PX;
    return below <= room
      ? Math.max(below, 0)
      : Math.min(Math.max(above - EDITOR_HEIGHT_PX, 0), room);
  };

  const playingRow = playback.positionMs === null ? null : store.rowContaining(playback.positionMs);
  const rows = [];
  for (let index = firstRow; index <= lastRow; index += 1) {
    const segment = store.segmentAt(index);
    const top = store.heights.topOf(index, rowCount);
    if (!segment) {
      rows.push(
        <div key={`gap-${index}`} className={styles.rowSlot} data-row-index={index}>
          <p className={styles.placeholder} style={{ transform: `translateY(${top}px)` }}>
            Loading…
          </p>
        </div>,
      );
      continue;
    }
    const inRange = range && index >= range.first.segment && index <= range.last.segment;
    rows.push(
      <div key={segment.id} className={styles.rowSlot} data-row-index={index}>
        <TranscriptRow
          segment={segment}
          speakerLabel={store.speakerLabel(segment.speakerId)}
          top={top}
          selectedFrom={inRange ? (index === range.first.segment ? range.first.word : 0) : null}
          selectedTo={
            inRange
              ? index === range.last.segment
                ? range.last.word
                : segment.words.length - 1
              : null
          }
          cursorWord={cursorPosition?.segment === index ? cursorPosition.word : null}
          playingMs={playingRow === index ? playback.positionMs : null}
        />
      </div>,
    );
  }

  const cursorWord =
    cursorPosition && store.segmentAt(cursorPosition.segment)?.words[cursorPosition.word];
  const status = store.getStatus();
  const error =
    playback.error ??
    undoState.error ??
    (selectionLost ? 'The selected text changed, so the selection was cleared.' : null);

  return (
    <section className={styles.transcript} aria-label="Transcript">
      <div className={styles.toolbar}>
        <div className={styles.legend} aria-label="Text styles">
          <span className={styles.word} data-state="provisional">
            Provisional
          </span>
          <span className={styles.word} data-state="final">
            Final
          </span>
          <span className={styles.word} data-state="corrected">
            Corrected
          </span>
        </div>
        {playback.positionMs !== null && (
          <span className={styles.playing} role="status">
            Playing {formatElapsed(playback.positionMs)}
            <button type="button" className={styles.toolButton} onClick={playback.stop}>
              Stop audio
            </button>
          </span>
        )}
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.toolButton}
            disabled={!undoState.canUndo}
            onClick={undoState.undo}
          >
            Undo
          </button>
          <button
            type="button"
            className={styles.toolButton}
            disabled={!undoState.canRedo}
            onClick={undoState.redo}
          >
            Redo
          </button>
          <button
            type="button"
            className={styles.toolButton}
            aria-label="Smaller transcript text"
            disabled={fontPx <= MIN_FONT_PX}
            onClick={() => onFontChange(fontPx - 1)}
          >
            A−
          </button>
          <button
            type="button"
            className={styles.toolButton}
            aria-label="Larger transcript text"
            disabled={fontPx >= MAX_FONT_PX}
            onClick={() => onFontChange(fontPx + 1)}
          >
            A+
          </button>
        </div>
      </div>
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      <div className={styles.frame}>
        <div
          ref={scrollRef}
          className={styles.scroller}
          tabIndex={0}
          role="group"
          aria-roledescription="transcript"
          aria-label="Live transcript"
          aria-describedby="transcript-keys"
          data-testid="transcript"
          data-following={following}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          onCopy={onCopy}
        >
          <div
            ref={canvasRef}
            className={styles.canvas}
            style={{ height: totalHeight, fontSize: fontPx }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={onDoubleClick}
          >
            {rows}
          </div>
          {status === 'failed' && (
            <p className={styles.empty} role="alert">
              The transcript could not be loaded.
            </p>
          )}
          {status === 'ready' && rowCount === 0 && (
            <p className={styles.empty}>Text appears here once people start talking.</p>
          )}
        </div>
        <p id="transcript-keys" className={styles.srOnly}>
          Arrow keys move between words. Shift with arrows selects. Enter corrects the selection.
          Space plays the audio. Escape clears the selection.
        </p>
        <p className={styles.srOnly} role="status">
          {cursorWord ? `${cursorWord.text}, ${formatElapsed(cursorWord.startMs)}` : ''}
        </p>
        {!following && (
          <button type="button" className={styles.jump} onClick={jumpToLive}>
            Jump to Live
          </button>
        )}
        {editing && range && (
          <CorrectionEditor
            key={`${selection?.anchor.wordId}-${selection?.focus.wordId}`}
            originalText={store.textBetween(range.first, range.last)}
            top={editorTop()}
            onApply={applyCorrection}
            onCancel={closeEditor}
          />
        )}
      </div>
    </section>
  );
}
