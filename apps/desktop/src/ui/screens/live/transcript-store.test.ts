import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptChanged, TranscriptSegment } from '@scrb/contracts';
import { MockBackend } from '../../mocks/index.ts';
import { RowHeights } from './row-heights.ts';
import { PAGE_SEGMENTS, TranscriptStore, type WordRef } from './transcript-store.ts';

function makeSegment(id: string, startMs: number, words = ['one', 'two']): TranscriptSegment {
  return {
    id,
    speakerId: 'sp-you',
    track: 'microphone',
    startMs,
    endMs: startMs + words.length * 100,
    words: words.map((text, index) => ({
      id: `${id}-${index}`,
      text,
      startMs: startMs + index * 100,
      endMs: startMs + (index + 1) * 100,
      state: 'final',
      correctionId: null,
    })),
  };
}

describe('TranscriptStore', () => {
  let backend: MockBackend;
  let store: TranscriptStore;
  let stop: () => void;
  let meetingId: string;

  const emit = (revision: number, change: TranscriptChanged['change']) =>
    backend.emit('transcriptChanged', { meetingId, revision, change, speakers: [] });
  const ids = () =>
    Array.from({ length: store.rowCount }, (_, index) => store.segmentAt(index)?.id);

  beforeEach(async () => {
    vi.useFakeTimers();
    window.localStorage.clear();
    backend = new MockBackend();
    ({ meetingId } = await backend.call('startRecording', {}));
    backend.dispose();
    store = new TranscriptStore(backend, meetingId);
    stop = store.start();
    await vi.advanceTimersByTimeAsync(0);
    emit(1, { kind: 'append', segments: [makeSegment('a', 0), makeSegment('c', 400)] });
  });

  afterEach(() => {
    stop();
    backend.dispose();
    vi.useRealTimers();
  });

  it('adds appended text', () => {
    expect(ids()).toEqual(['a', 'c']);
  });

  it('inserts, removes and overwrites on replace, keeping row order', () => {
    emit(2, { kind: 'replace', segments: [makeSegment('b', 200)], removedSegmentIds: [] });
    expect(ids()).toEqual(['a', 'b', 'c']);
    emit(3, {
      kind: 'replace',
      segments: [makeSegment('a', 0, ['fixed'])],
      removedSegmentIds: ['b'],
    });
    expect(ids()).toEqual(['a', 'c']);
    expect(store.segmentAt(0)?.words[0]?.text).toBe('fixed');
    expect(store.positionOf({ segmentId: 'c', wordId: 'c-1', startMs: 500 })).toEqual({
      segment: 1,
      word: 1,
    });
  });

  it('moves word timing on realign', () => {
    emit(2, { kind: 'realign', words: [{ id: 'a-0', startMs: 10, endMs: 90 }] });
    expect(store.segmentAt(0)?.words[0]).toMatchObject({ startMs: 10, endMs: 90, text: 'one' });
  });

  it('ignores a repeated event and reloads after a skipped one', async () => {
    emit(1, { kind: 'append', segments: [makeSegment('z', 900)] });
    expect(store.rowCount).toBe(2);
    emit(5, { kind: 'append', segments: [makeSegment('y', 900)] });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.rowCount).toBe(0);
  });

  it('follows a replaced word to whatever now covers the same moment', () => {
    const ref = { segmentId: 'c', wordId: 'c-1', startMs: 500 };
    emit(2, {
      kind: 'replace',
      segments: [makeSegment('c2', 400, ['new', 'words'])],
      removedSegmentIds: ['c'],
    });
    expect(store.resolve(ref)).toMatchObject({
      segmentId: 'c2',
      wordId: 'c2-1',
      startMs: 500,
      text: 'words',
    });
  });

  it('does not hand a removed word to a neighbour that the rewrite kept', () => {
    emit(2, {
      kind: 'replace',
      segments: [makeSegment('c', 400, ['one', 'maybe'])],
      removedSegmentIds: [],
    });
    const yes = { segmentId: 'c', wordId: 'gone', startMs: 500, text: 'yes' };
    expect(store.resolve(yes)).toBeNull();
    const retimed = { segmentId: 'c', wordId: 'gone', startMs: 530, text: 'maybe' };
    expect(store.resolve(retimed)).toMatchObject({ wordId: 'c-1', text: 'maybe' });
  });

  it('follows a small re-timing, but not a repeat of the word seconds away or an ambiguous pair', () => {
    const words = (items: [string, number][]) => ({
      ...makeSegment('c', 400, []),
      endMs: 5000,
      words: items.map(([text, startMs], i) => ({
        id: `n-${i}`,
        text,
        startMs,
        endMs: startMs + 80,
        state: 'provisional' as const,
        correctionId: null,
      })),
    });
    const send = (revision: number, items: [string, number][]) =>
      emit(revision, { kind: 'replace', segments: [words(items)], removedSegmentIds: [] });
    const ref = { segmentId: 'c', wordId: 'old', startMs: 500, text: 'yes' };
    send(2, [['yes', 530]]);
    expect(store.resolve(ref)).toMatchObject({ wordId: 'n-0' });
    send(3, [
      ['no', 500],
      ['yes', 4000],
    ]);
    expect(store.resolve(ref)).toBeNull();
    send(4, [
      ['yes', 450],
      ['yes', 600],
    ]);
    expect(store.resolve(ref)).toBeNull();
  });

  it('refuses a same-text word 120 ms away when its neighbours differ', () => {
    const put = (revision: number, items: [string, number][]) =>
      emit(revision, {
        kind: 'replace',
        segments: [
          {
            ...makeSegment('c', 400, []),
            endMs: 3000,
            words: items.map(([text, startMs], i) => ({
              id: `m-${i}`,
              text,
              startMs,
              endMs: startMs + 80,
              state: 'provisional' as const,
              correctionId: null,
            })),
          },
        ],
        removedSegmentIds: [],
      });
    put(2, [
      ['say', 300],
      ['yes', 500],
      ['and', 700],
      ['yes', 900],
    ]);
    const picked = store.refAt({ segment: 1, word: 1 }) as WordRef;
    expect(picked).toMatchObject({ text: 'yes', before: 'say', after: 'and' });
    // The first "yes" is deleted; the other one now sits 120 ms from where it was.
    put(3, [
      ['say', 300],
      ['and', 400],
      ['yes', 620],
    ]);
    expect(store.resolve({ ...picked, wordId: 'gone' })).toBeNull();
    // The same word, re-timed with the same neighbours, is still followed.
    put(4, [
      ['say', 310],
      ['yes', 540],
      ['and', 700],
    ]);
    expect(store.resolve({ ...picked, wordId: 'gone' })).toMatchObject({ wordId: 'm-1' });
  });

  it('gives up on a word whose moment has no text left', () => {
    const ref = { segmentId: 'c', wordId: 'c-1', startMs: 500 };
    emit(2, { kind: 'replace', segments: [], removedSegmentIds: ['c'] });
    expect(store.resolve(ref)).toBeNull();
  });

  it('holds only the pages asked for, plus the tail', async () => {
    backend.startLongLiveMeeting();
    const { state } = await backend.call('getRecordingSnapshot');
    const long = new TranscriptStore(backend, state.meetingId as string);
    const stopLong = long.start();
    await vi.advanceTimersByTimeAsync(0);
    long.ensureRange(1000, 1010);
    await vi.advanceTimersByTimeAsync(0);
    expect(long.rowCount).toBeGreaterThan(3000);
    expect(long.segmentAt(1005)).toBeTruthy();
    expect(long.segmentAt(long.rowCount - 1)).toBeTruthy();
    expect(long.segmentAt(PAGE_SEGMENTS + 1)).toBeUndefined();
    stopLong();
  });
});

describe('RowHeights', () => {
  const rows = new RowHeights((index) => ({ id: `r${index}`, wordCount: 10 }));

  it('finds rows by offset and reports how far a measured row moves those below', () => {
    const before = rows.topOf(5, 100);
    const estimate = rows.topOf(3, 100) - rows.topOf(2, 100);
    expect(rows.measure(2, 'r2', estimate + 40)).toBe(40);
    expect(rows.topOf(5, 100)).toBe(before + 40);
    expect(rows.indexAt(rows.topOf(7, 100) + 1, 100)).toBe(7);
    expect(rows.indexAt(1e9, 100)).toBe(99);
  });

  it('forgets measurements when the layout changes', () => {
    rows.setLayout({ widthPx: 300, fontPx: 20 });
    expect(rows.measure(2, 'r2', rows.topOf(3, 100) - rows.topOf(2, 100))).toBe(0);
  });
});
