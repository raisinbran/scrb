// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Library, Segment } from '@scrb/storage';
import { LiveTranscriptSink } from './live-transcript.ts';

const utterance = (id: string, startMs: number) => ({
  id,
  track: 'meeting' as const,
  speakerId: 'speaker-one',
  speakerLabel: 'Speaker 1',
  startMs,
  endMs: startMs + 250,
  text: 'Invented sample',
});

describe('nonblocking live-transcript sink (native PCM feed not wired)', () => {
  it('keeps reporting failed when the worker dies during a save', async () => {
    let resolveWrite!: (value: { revision: number }) => void;
    const appendSegments = vi.fn(
      () =>
        new Promise<{ revision: number }>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const emit = vi.fn();
    const sink = new LiveTranscriptSink(
      { appendSegments } as unknown as Library,
      'meeting-one',
      emit,
    );
    sink.offer(utterance('segment-one', 100));
    sink.workerFailed();
    resolveWrite({ revision: 4 });
    await sink.stop();
    const lag = emit.mock.calls.filter(([name]) => name === 'transcriptionLag');
    expect(lag.at(-1)?.[1]).toEqual({ status: 'failed', lagMs: 0 });
  });

  it('persists before publishing, and emits bounded, page-compatible changes', async () => {
    let resolveWrite!: (value: { revision: number }) => void;
    const appendSegments = vi.fn(
      () =>
        new Promise<{ revision: number }>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const emit = vi.fn();
    const sink = new LiveTranscriptSink(
      { appendSegments } as unknown as Library,
      'meeting-one',
      emit,
    );
    sink.offer(utterance('segment-one', 100));
    expect(appendSegments).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalledWith('transcriptChanged', expect.anything());
    resolveWrite({ revision: 4 });
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith(
        'transcriptChanged',
        expect.objectContaining({
          meetingId: 'meeting-one',
          revision: 4,
          change: {
            kind: 'replace',
            removedSegmentIds: [],
            segments: [expect.objectContaining({ id: 'segment-one', startMs: 100, endMs: 350 })],
          },
        }),
      ),
    );
    await sink.stop();
  });

  it('drops pending provisional segments under overload without blocking capture', async () => {
    let release!: (value: { revision: number }) => void;
    const appendSegments = vi.fn(async (meetingId: string, segments: Segment[]) => {
      expect(meetingId).toBe('meeting-one');
      expect(segments).toHaveLength(1);
      return new Promise<{ revision: number }>((resolve) => {
        release = resolve;
      });
    });
    const emit = vi.fn();
    const sink = new LiveTranscriptSink(
      { appendSegments } as unknown as Library,
      'meeting-one',
      emit,
      2,
    );
    sink.offer(utterance('first', 0));
    sink.offer(utterance('second', 1000));
    sink.offer(utterance('third', 2000));
    sink.offer(utterance('fourth', 3000));
    expect(appendSegments).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'lagging', lagMs: 0 });
    release({ revision: 1 });
    await vi.waitFor(() => expect(appendSegments).toHaveBeenCalledTimes(2));
    release({ revision: 2 });
    await vi.waitFor(() => expect(appendSegments).toHaveBeenCalledTimes(3));
    release({ revision: 3 });
    await sink.stop();
    const ids = appendSegments.mock.calls.map(
      ([, segments]) => (segments as { id: string }[])[0]?.id,
    );
    expect(ids).toEqual(['first', 'third', 'fourth']);
    expect(appendSegments.mock.calls.every(([meetingId]) => meetingId === 'meeting-one')).toBe(
      true,
    );
  });

  it('converts a failed save or model failure into live-only failure and never throws at capture', async () => {
    const appendSegments = vi.fn(async () => {
      throw new Error('synthetic write fault');
    });
    const emit = vi.fn();
    const sink = new LiveTranscriptSink(
      { appendSegments } as unknown as Library,
      'meeting-one',
      emit,
    );
    expect(() => sink.offer(utterance('one', 0))).not.toThrow();
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'failed', lagMs: 0 }),
    );
    sink.offer(utterance('two', 1000));
    expect(appendSegments).toHaveBeenCalledTimes(1);
    await sink.stop();
  });
});
