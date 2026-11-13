import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Backend,
  EventName,
  RecordingHealth,
  RecordingSnapshot,
  RecordingState,
} from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MiniRecording } from './MiniRecording.tsx';

const recording = (status: RecordingState['status'], elapsedMs = 65_000): RecordingState => ({
  status,
  meetingId: 'invented-meeting',
  elapsedMs,
  pauseReason: null,
  privacyBannerRequired: false,
});
const warned: RecordingHealth = {
  level: 'warning',
  warnings: [{ kind: 'deviceChanged', message: 'Microphone changed', atMs: 1000 }],
  diskFreeBytes: 1e10,
};

function fakeBackend() {
  const listeners = new Map<EventName, ((payload: never) => void)[]>();
  let resolveSnapshot: (snapshot: RecordingSnapshot) => void = () => undefined;
  const backend = {
    call: () => new Promise<RecordingSnapshot>((resolve) => (resolveSnapshot = resolve)),
    on: (name: EventName, listener: (payload: never) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return () => undefined;
    },
  } as unknown as Backend;
  return {
    backend,
    emit: (name: EventName, payload: unknown) =>
      listeners.get(name)?.forEach((listener) => listener(payload as never)),
    snapshot: (snapshot: RecordingSnapshot) => resolveSnapshot(snapshot),
  };
}

function show(fake: ReturnType<typeof fakeBackend>) {
  render(
    <BackendProvider backend={fake.backend}>
      <MiniRecording />
    </BackendProvider>,
  );
}

afterEach(cleanup);

describe('MiniRecording', () => {
  it('opened while paused with a warning already present, shows both from the snapshot', async () => {
    const fake = fakeBackend();
    show(fake);
    await act(async () =>
      fake.snapshot({
        state: recording('paused'),
        pauseSpans: [],
        health: warned,
        transcription: null,
      }),
    );
    expect(screen.getByText(/Paused/)).toBeTruthy();
    expect(screen.getByText('01:05')).toBeTruthy();
    expect(screen.getByText('Microphone changed')).toBeTruthy();
  });

  it('prefers an event that arrived before the snapshot resolved', async () => {
    const fake = fakeBackend();
    show(fake);
    act(() => {
      fake.emit('recordingStateChanged', recording('recording', 9000));
      fake.emit('recordingHealth', warned);
    });
    await act(async () =>
      fake.snapshot({
        state: recording('idle', 0),
        pauseSpans: [],
        health: { level: 'ok', warnings: [], diskFreeBytes: 1e10 },
        transcription: null,
      }),
    );
    expect(screen.getByText(/Recording/)).toBeTruthy();
    expect(screen.getByText('Microphone changed')).toBeTruthy();
  });

  it('counts on only from the resume, not through a long pause', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeBackend();
      show(fake);
      await act(async () =>
        fake.snapshot({
          state: recording('recording', 10_000),
          pauseSpans: [],
          health: null,
          transcription: null,
        }),
      );
      act(() => {
        fake.emit('recordingStateChanged', recording('paused', 10_000));
      });
      act(() => {
        vi.advanceTimersByTime(10 * 60_000);
      });
      expect(screen.getByText('00:10')).toBeTruthy();
      act(() => {
        fake.emit('recordingStateChanged', recording('recording', 10_000));
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('00:11')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no transcript text', async () => {
    const fake = fakeBackend();
    show(fake);
    await act(async () =>
      fake.snapshot({
        state: recording('recording'),
        pauseSpans: [],
        health: null,
        transcription: null,
      }),
    );
    expect(document.body.textContent).toBe('Recording 01:05');
  });
});
