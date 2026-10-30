import type { TranscriptStore, WordPosition, WordRef } from './transcript-store.ts';

export interface WordSelection {
  anchor: WordRef;
  focus: WordRef;
}

export interface SelectionRange {
  first: WordPosition;
  last: WordPosition;
}

function comparePositions(a: WordPosition, b: WordPosition): number {
  return a.segment - b.segment || a.word - b.word;
}

export function rangeOf(store: TranscriptStore, selection: WordSelection): SelectionRange | null {
  const anchor = store.positionOf(selection.anchor);
  const focus = store.positionOf(selection.focus);
  if (!anchor || !focus) return null;
  return comparePositions(anchor, focus) <= 0
    ? { first: anchor, last: focus }
    : { first: focus, last: anchor };
}

/** Follows both ends after a transcript change. Null means the selected text is gone. */
export function resolveSelection(
  store: TranscriptStore,
  selection: WordSelection,
): WordSelection | null {
  const anchor = store.resolve(selection.anchor);
  const focus = store.resolve(selection.focus);
  if (!anchor || !focus) return null;
  return anchor === selection.anchor && focus === selection.focus ? selection : { anchor, focus };
}

export type CursorMove = 'left' | 'right' | 'up' | 'down' | 'lineStart' | 'lineEnd';

/** The position one key press away, or null at either end of the loaded text. */
export function movePosition(
  store: TranscriptStore,
  { segment, word }: WordPosition,
  move: CursorMove,
): WordPosition | null {
  const wordCount = store.segmentAt(segment)?.words.length ?? 0;
  switch (move) {
    case 'lineStart':
      return { segment, word: 0 };
    case 'lineEnd':
      return { segment, word: Math.max(wordCount - 1, 0) };
    case 'left':
      if (word > 0) return { segment, word: word - 1 };
      return lastWordOf(store, segment - 1);
    case 'right':
      if (word + 1 < wordCount) return { segment, word: word + 1 };
      return store.segmentAt(segment + 1) ? { segment: segment + 1, word: 0 } : null;
    case 'up':
    case 'down': {
      const target = segment + (move === 'up' ? -1 : 1);
      const words = store.segmentAt(target)?.words.length;
      return words ? { segment: target, word: Math.min(word, words - 1) } : null;
    }
  }
}

function lastWordOf(store: TranscriptStore, segment: number): WordPosition | null {
  const words = store.segmentAt(segment)?.words.length;
  return words ? { segment, word: words - 1 } : null;
}
