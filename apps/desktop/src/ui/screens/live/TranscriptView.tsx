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
import { ContextMenu, CONTEXT_MENU_MARK } from '../../components/ContextMenu.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { formatElapsed } from '../../lib/format.ts';
import { animateTranscriptScroll } from '../../lib/transcript-scroll.ts';
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
/** A mouse move shorter than this after mousedown is still a click. */
const DRAG_THRESHOLD_PX = 4;

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

/** Each line is set in the style it describes, using the transcript's own word styles. */
const STYLE_HELP = (
  <span className={styles.styleHelp}>
    <span className={styles.word} data-state="provisional">
      Provisional: text just heard, which may still change.
    </span>
    <span className={styles.word} data-state="final">
      Final: text that has settled.
    </span>
    <span className={styles.word} data-state="corrected">
      Corrected: words you edited.
    </span>
  </span>
);

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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const frameElement = useRef<HTMLDivElement>(null);

  const playback = usePlayback(meetingId);
  const undoState = useUndo(meetingId);
  const dragRef = useRef<{ anchor: WordRef; moved: boolean; x: number; y: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const jumpCancel = useRef<(() => void) | null>(null);
  const followCancel = useRef<(() => void) | null>(null);
  const jumpingToLive = useRef(false);
  const animatedScrollTop = useRef<number | null>(null);
  const reachedBottomByCode = useRef(false);
  const anchorRef = useRef<{ id: string | null; index: number; top: number } | null>(null);

  useEffect(
    () => () => {
      clearTimeout(clickTimer.current);
      jumpCancel.current?.();
      followCancel.current?.();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

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
    let changed = false;
    for (const row of canvas.querySelectorAll<HTMLElement>('[data-row-index]')) {
      const height = row.getBoundingClientRect().height;
      const index = Number(row.dataset['rowIndex']);
      const id = row.firstElementChild?.getAttribute('data-segment-id');
      if (!height || !id) continue;
      if (store.heights.measure(index, id, height) !== 0) changed = true;
    }
    const count = store.rowCount;
    const anchor = anchorRef.current;
    if (anchor && !following && !jumpingToLive.current) {
      const row = (anchor.id !== null ? store.rowOf(anchor.id) : null) ?? anchor.index;
      const moved = store.heights.topOf(row, count) - anchor.top;
      if (moved !== 0) {
        element.scrollTop += moved;
        setScrollTop(element.scrollTop);
      }
    }
    const index = store.heights.indexAt(element.scrollTop, count);
    anchorRef.current = {
      id: store.segmentAt(index)?.id ?? null,
      index,
      top: store.heights.topOf(index, count),
    };
    if (changed) setMeasureTick((tick) => tick + 1);
  }, [store, version, firstRow, lastRow, firstVisible, following, fontPx, viewport, measureTick]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !following || jumpingToLive.current) return;
    const bottom = Math.max(totalHeight - element.clientHeight, 0);
    if (Math.abs(element.scrollTop - bottom) >= 1) {
      followCancel.current?.();
      reachedBottomByCode.current = true;
      animatedScrollTop.current = element.scrollTop;
      followCancel.current = animateTranscriptScroll(element, bottom, {
        maxDurationMs: 240,
        onPosition: (top) => {
          animatedScrollTop.current = top;
          setScrollTop(top);
        },
        onComplete: () => {
          followCancel.current = null;
          animatedScrollTop.current = null;
          reachedBottomByCode.current = true;
        },
      });
    }
  }, [following, totalHeight, viewport.height, measureTick]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    if (jumpingToLive.current || followCancel.current) {
      // Only ignore movement that came from our own animation. A manual scrollbar drag,
      // keyboard scroll, or restored scroll position can occur while it is in flight.
      if (
        animatedScrollTop.current === null ||
        Math.abs(element.scrollTop - animatedScrollTop.current) > 1
      ) {
        jumpCancel.current?.();
        followCancel.current?.();
        jumpCancel.current = null;
        followCancel.current = null;
        jumpingToLive.current = false;
        animatedScrollTop.current = null;
        reachedBottomByCode.current = false;
        setFollowing(false);
      }
    } else if (reachedBottomByCode.current) {
      reachedBottomByCode.current = false;
    } else {
      const gap = element.scrollHeight - element.scrollTop - element.clientHeight;
      setFollowing(gap < STICK_TO_BOTTOM_PX && selection === null);
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

  const interruptJump = () => {
    const animated = jumpingToLive.current || followCancel.current !== null;
    jumpCancel.current?.();
    jumpCancel.current = null;
    followCancel.current?.();
    followCancel.current = null;
    animatedScrollTop.current = null;
    jumpingToLive.current = false;
    if (animated) setFollowing(false);
  };

  const jumpToLive = useCallback(() => {
    setSelection(null);
    setEditing(false);
    setCursor(null);
    const element = scrollRef.current;
    if (!element) {
      setFollowing(true);
      return;
    }
    jumpCancel.current?.();
    followCancel.current?.();
    followCancel.current = null;
    jumpingToLive.current = true;
    animatedScrollTop.current = element.scrollTop;
    const bottom = Math.max(store.heights.totalHeight(store.rowCount) - element.clientHeight, 0);
    jumpCancel.current = animateTranscriptScroll(element, bottom, {
      onPosition: (top) => {
        animatedScrollTop.current = top;
        setScrollTop(top);
      },
      onComplete: () => {
        jumpingToLive.current = false;
        jumpCancel.current = null;
        animatedScrollTop.current = null;
        reachedBottomByCode.current = true;
        setFollowing(true);
      },
    });
    element.focus();
  }, [store]);

  useImperativeHandle(ref, () => ({ jumpToLive, undo: undoState.undo, redo: undoState.redo }), [
    jumpToLive,
    undoState.undo,
    undoState.redo,
  ]);

  const startSelection = (next: WordSelection) => {
    interruptJump();
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
    if (!ref) {
      // A click on empty canvas dismisses the selection and any open editor.
      setSelection(null);
      setEditing(false);
      return;
    }
    if (event.shiftKey && liveSelection) {
      startSelection({ anchor: liveSelection.anchor, focus: ref });
      dragRef.current = {
        anchor: liveSelection.anchor,
        moved: true,
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }
    dragRef.current = { anchor: ref, moved: false, x: event.clientX, y: event.clientY };
  };

  const onMouseMove = (event: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
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
    if (['PageUp', 'PageDown'].includes(event.key)) interruptJump();
    if (move) {
      interruptJump();
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

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const ref = refFromEvent(event);
    if (!ref) return;
    // Right-clicking inside the selection keeps it; anywhere else selects the word under the pointer.
    const position = store.positionOf(ref);
    const inside =
      range &&
      position &&
      (position.segment - range.first.segment || position.word - range.first.word) >= 0 &&
      (position.segment - range.last.segment || position.word - range.last.word) <= 0;
    if (!inside) {
      startSelection({ anchor: ref, focus: ref });
      setEditing(false);
    }
    setMenu({ x: event.clientX, y: event.clientY });
  };

  const copySelection = () => {
    if (!range) return;
    void navigator.clipboard?.writeText(store.textBetween(range.first, range.last));
  };

  const onCopy = (event: ClipboardEvent) => {
    if (!range) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', store.textBetween(range.first, range.last));
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  // Clicking or focusing anywhere outside the transcript clears the highlight.
  useEffect(() => {
    if (!selection) return undefined;
    const outside = (target: EventTarget | null) =>
      target instanceof Node &&
      !frameElement.current?.contains(target) &&
      !(target instanceof Element && target.closest(`[${CONTEXT_MENU_MARK}]`));
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) {
        setSelection(null);
        setEditing(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (outside(event.target)) setSelection(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [selection]);

  const closeEditor = () => {
    setEditing(false);
    setSelection(null);
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
    const slotStyle = { transform: `translateY(${store.heights.topOf(index, rowCount)}px)` };
    if (!segment) {
      rows.push(
        <div
          key={`gap-${index}`}
          className={styles.rowSlot}
          style={slotStyle}
          data-row-index={index}
        >
          <p className={styles.placeholder}>Loading…</p>
        </div>,
      );
      continue;
    }
    const inRange = range && index >= range.first.segment && index <= range.last.segment;
    rows.push(
      <div key={segment.id} className={styles.rowSlot} style={slotStyle} data-row-index={index}>
        <TranscriptRow
          segment={segment}
          speakerLabel={store.speakerLabel(segment.speakerId)}
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
        <div className={styles.heading}>
          <h2 className={styles.title}>Live transcript</h2>
          <IconButton label="Text styles" tip={STYLE_HELP} icon="info" />
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
          <IconButton
            label="Smaller transcript text"
            tip="Decrease text size"
            icon="textSmaller"
            className={styles.toolIcon}
            disabled={fontPx <= MIN_FONT_PX}
            onClick={() => onFontChange(fontPx - 1)}
          />
          <IconButton
            label="Larger transcript text"
            tip="Increase text size"
            icon="textLarger"
            className={styles.toolIcon}
            disabled={fontPx >= MAX_FONT_PX}
            onClick={() => onFontChange(fontPx + 1)}
          />
        </div>
      </div>
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      <div ref={frameElement} className={styles.frame}>
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
          onWheel={() => {
            interruptJump();
            setFollowing(false);
          }}
          onTouchMove={() => {
            interruptJump();
            setFollowing(false);
          }}
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
            onContextMenu={onContextMenu}
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
        {menu && (
          <ContextMenu
            label="Transcript actions"
            x={menu.x}
            y={menu.y}
            onClose={closeMenu}
            items={[
              { label: 'Copy', onSelect: copySelection },
              { label: 'Correct text', onSelect: () => setEditing(true) },
            ]}
          />
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
      <div className={styles.footer}>
        <button type="button" className={styles.jump} disabled={following} onClick={jumpToLive}>
          Jump to Live
        </button>
      </div>
    </section>
  );
}
