import { describe, expect, it } from 'vitest';
import type {
  Backend,
  TranscriptChanged,
  TranscriptPage,
  TranscriptSegment,
} from '@scrb/contracts';
import { PAGE_SEGMENTS, TranscriptStore } from './transcript-store.ts';

const EIGHT_HOUR_ROWS = 4800;

function row(index: number): TranscriptSegment {
  const startMs = index * 6000;
  return {
    id: `invented-${index}`,
    speakerId: 'invented-speaker',
    track: 'meeting',
    startMs,
    endMs: startMs + 5000,
    words: [
      {
        id: `invented-${index}-word`,
        text: 'invented',
        startMs,
        endMs: startMs + 5000,
        state: 'provisional',
        correctionId: null,
      },
    ],
  };
}

/** A backend whose page replies wait for the test, as a slow IPC round trip would. */
function fakeBackend(rows: number, startRevision = 10) {
  const held: { offset: number; reply: () => void }[] = [];
  let listener: ((event: TranscriptChanged) => void) | null = null;
  const state = { revision: startRevision, requests: [] as number[] };
  const backend = {
    on: (_name: string, handler: (event: TranscriptChanged) => void) => {
      listener = handler;
      return () => undefined;
    },
    call: (_name: string, { offset, limit }: { offset: number; limit: number }) => {
      state.requests.push(offset);
      const page: TranscriptPage = {
        meetingId: 'invented-meeting',
        revision: state.revision,
        totalSegments: rows,
        totalWords: rows,
        segments: Array.from({ length: Math.min(limit, rows - offset) }, (_, i) => row(offset + i)),
        speakers: [],
      };
      return new Promise<TranscriptPage>((resolve) => {
        held.push({ offset, reply: () => resolve(page) });
      });
    },
  } as unknown as Backend;
  const emit = (change: TranscriptChanged['change']) => {
    state.revision += 1;
    listener?.({ meetingId: 'invented-meeting', revision: state.revision, change, speakers: [] });
  };
  const flush = async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  };
  const replyAll = async () => {
    while (held.length > 0) {
      held.shift()?.reply();
      await flush();
    }
  };
  return { backend, held, state, emit, flush, replyAll };
}

const REPLACE_NOTHING: TranscriptChanged['change'] = {
  kind: 'replace',
  segments: [],
  removedSegmentIds: [],
};

describe('transcript catch-up on an 8-hour meeting', () => {
  it('fetches a page again when an event overtakes it and nothing follows', async () => {
    const f = fakeBackend(EIGHT_HOUR_ROWS);
    const store = new TranscriptStore(f.backend, 'invented-meeting');
    store.start();
    await f.replyAll();

    store.ensureRange(PAGE_SEGMENTS, PAGE_SEGMENTS + 1);
    const overtaken = f.held.find(({ offset }) => offset === PAGE_SEGMENTS);
    expect(overtaken).toBeDefined();
    f.emit(REPLACE_NOTHING);
    await f.replyAll();

    expect(store.segmentAt(PAGE_SEGMENTS)?.id).toBe(`invented-${PAGE_SEGMENTS}`);
  });

  it('reloads when an event lands while the first page is on its way', async () => {
    const f = fakeBackend(EIGHT_HOUR_ROWS);
    const store = new TranscriptStore(f.backend, 'invented-meeting');
    store.start();
    expect(f.held).toHaveLength(1);
    f.emit({ kind: 'append', segments: [row(EIGHT_HOUR_ROWS)] });
    await f.replyAll();
    expect(f.state.requests.filter((offset) => offset === 0).length).toBe(2);
  });

  it('keeps the rows it holds while a burst of updates arrives during scrolling', async () => {
    const f = fakeBackend(EIGHT_HOUR_ROWS);
    const store = new TranscriptStore(f.backend, 'invented-meeting');
    store.start();
    await f.replyAll();
    store.ensureRange(2400, 2410);
    await f.replyAll();
    const started = performance.now();
    for (let i = 0; i < 600; i += 1) {
      f.emit({ kind: 'append', segments: [row(EIGHT_HOUR_ROWS + i)] });
      store.ensureRange(2400 + (i % 50), 2410 + (i % 50));
      store.heights.totalHeight(store.rowCount);
    }
    await f.replyAll();
    expect(store.rowCount).toBe(EIGHT_HOUR_ROWS + 600);
    expect(store.segmentAt(2405)?.id).toBe('invented-2405');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
