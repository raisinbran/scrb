import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Backend, TranscriptChanged, TranscriptSegment } from '@scrb/contracts';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { useTranscript } from './use-transcript.ts';

const PAGE = 1000;
const ROWS = 4800;

function row(index: number, text = 'invented'): TranscriptSegment {
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
        text,
        startMs,
        endMs: startMs + 5000,
        state: 'final',
        correctionId: null,
      },
    ],
  };
}

/** Serves an 8-hour transcript a page at a time, waiting for the test between replies. */
function setup() {
  const rows = Array.from({ length: ROWS }, (_, i) => row(i));
  const held: (() => void)[] = [];
  let listener: ((event: TranscriptChanged) => void) | null = null;
  const state = { revision: 3 };
  const backend = {
    on: (_name: string, handler: (event: TranscriptChanged) => void) => {
      listener = handler;
      return () => undefined;
    },
    call: (_name: string, { offset }: { offset: number }) => {
      const page = {
        revision: state.revision,
        totalSegments: rows.length,
        segments: rows.slice(offset, offset + PAGE),
        speakers: [],
      };
      return new Promise((resolve) => held.push(() => resolve(page)));
    },
  } as unknown as Backend;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BackendProvider backend={backend}>{children}</BackendProvider>
  );
  const hook = renderHook(() => useTranscript('invented-meeting', 'ready'), { wrapper });
  const reply = async (count: number) => {
    for (let i = 0; i < count; i += 1) {
      await act(async () => {
        held.shift()?.();
        await new Promise((resolve) => setTimeout(resolve));
      });
    }
  };
  const rewrite = (index: number, text: string) => {
    const segment = row(index, text);
    rows[index] = segment;
    state.revision += 1;
    act(() =>
      listener?.({
        meetingId: 'invented-meeting',
        revision: state.revision,
        change: { kind: 'replace', segments: [segment], removedSegmentIds: [] },
        speakers: [],
      }),
    );
  };
  return { hook, reply, rewrite, held };
}

describe('useTranscript on an 8-hour meeting', () => {
  afterEach(cleanup);

  it('ends with the latest text when it changes between pages', async () => {
    const { hook, reply, rewrite } = setup();
    await reply(2);
    rewrite(5, 'rewritten');
    await reply(12);
    const { segments, loading, totalSegments } = hook.result.current;
    expect(loading).toBe(false);
    expect(totalSegments).toBe(ROWS);
    expect(segments).toHaveLength(ROWS);
    expect(segments[5]?.words[0]?.text).toBe('rewritten');
  });

  it('keeps the latest text when a change lands during the last page', async () => {
    const { hook, reply, rewrite, held } = setup();
    await reply(4);
    expect(held).toHaveLength(1);
    rewrite(5, 'rewritten');
    await reply(8);
    expect(hook.result.current.segments[5]?.words[0]?.text).toBe('rewritten');
    expect(hook.result.current.segments).toHaveLength(ROWS);
  });
});
