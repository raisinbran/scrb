import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent } from '@testing-library/react';
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
afterEach(() => vi.unstubAllGlobals());

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

  it('keeps the status row and one fixed slot when the warning comes and goes', async () => {
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
    const shape = () =>
      Array.from(document.querySelector('[role=status]')!.children).map((c) => c.tagName);
    const before = shape();
    expect(before).toHaveLength(2);
    act(() => fake.emit('recordingHealth', warned));
    expect(screen.getByText('Microphone changed')).toBeTruthy();
    expect(shape()).toEqual(before);
    act(() => fake.emit('recordingHealth', { level: 'ok', warnings: [], diskFreeBytes: 1e10 }));
    expect(shape()).toEqual(before);
  });

  it('shows who spoke last, highlighted while recent, without their words', async () => {
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
    const words = [
      {
        id: 'w',
        text: 'secretwords',
        startMs: 8000,
        endMs: 9000,
        state: 'final',
        correctionId: null,
      },
    ];
    act(() =>
      fake.emit('transcriptChanged', {
        meetingId: 'invented-meeting',
        revision: 1,
        change: {
          kind: 'append',
          segments: [{ id: 's', speakerId: 'a', track: 'mic', startMs: 8000, endMs: 9000, words }],
        },
        speakers: [{ id: 'a', label: 'You', kind: 'you', profileId: null }],
      }),
    );
    const slot = screen.getByText('You');
    expect(slot.getAttribute('data-active')).toBe('true');
    expect(document.body.textContent).not.toContain('secretwords');
  });

  it('dims the speaker once they have been quiet a while', async () => {
    const fake = fakeBackend();
    show(fake);
    await act(async () =>
      fake.snapshot({
        state: recording('recording', 60_000),
        pauseSpans: [],
        health: null,
        transcription: null,
      }),
    );
    act(() =>
      fake.emit('transcriptChanged', {
        meetingId: 'invented-meeting',
        revision: 1,
        change: {
          kind: 'append',
          segments: [
            { id: 's', speakerId: 'a', track: 'mic', startMs: 1000, endMs: 2000, words: [] },
          ],
        },
        speakers: [{ id: 'a', label: 'Speaker 2', kind: 'unknown', profileId: null }],
      }),
    );
    expect(screen.getByText('Speaker 2').getAttribute('data-active')).toBe('false');
  });

  it('opens the show-main address when Show Scribe is pressed', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
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
    screen.getByRole('button', { name: 'Show Scribe' }).click();
    expect(open).toHaveBeenCalledWith('scrb-app://show-main');
    open.mockRestore();
  });

  it('ignores another meeting’s events, even with a reused speaker ID', async () => {
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
    const event = (meetingId: string, endMs: number, label: string) => ({
      meetingId,
      revision: 1,
      change: {
        kind: 'append',
        segments: [
          { id: `s${endMs}`, speakerId: 'a', track: 'mic', startMs: endMs - 500, endMs, words: [] },
        ],
      },
      speakers: [{ id: 'a', label, kind: 'unknown', profileId: null }],
    });
    act(() => fake.emit('transcriptChanged', event('invented-meeting', 9000, 'Ana')));
    act(() => fake.emit('transcriptChanged', event('other-meeting', 9500, 'Ben')));
    act(() =>
      fake.emit('transcriptChanged', {
        meetingId: 'other-meeting',
        revision: 2,
        change: { kind: 'replace', segments: [], removedSegmentIds: ['x'] },
        speakers: [{ id: 'a', label: 'Ben', kind: 'named', profileId: null }],
      }),
    );
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.queryByText('Ben')).toBeNull();
  });

  async function showRecording(elapsedMs: number, health: RecordingHealth | null = null) {
    const fake = fakeBackend();
    show(fake);
    await act(async () =>
      fake.snapshot({
        state: recording('paused', elapsedMs),
        pauseSpans: [],
        health,
        transcription: null,
      }),
    );
  }

  it('the two buttons ask the main process by exact address and swap the compact label', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    await showRecording(65_000);
    fireEvent.click(screen.getByRole('button', { name: 'Show Scribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make smaller' }));
    expect(open.mock.calls).toEqual([['scrb-app://show-main'], ['scrb-app://mini-compact']]);
    fireEvent.click(screen.getByRole('button', { name: 'Make larger' }));
    expect(open).toHaveBeenLastCalledWith('scrb-app://mini-expand');
  });

  it('compact keeps the time and a warning flag, and drops the slot', async () => {
    await showRecording(65_000, warned);
    fireEvent.click(screen.getByRole('button', { name: 'Make smaller' }));
    expect(screen.getByText('01:05')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Microphone changed' })).toBeTruthy();
    expect(screen.queryByText('Microphone changed')).toBeNull();
  });

  it('shows 99:59:59 in full on the status row', async () => {
    await showRecording((99 * 3600 + 59 * 60 + 59) * 1000);
    expect(screen.getByText('99:59:59')).toBeTruthy();
  });

  it('the row cannot reflow as the time grows: fixed-width time, buttons that do not shrink', () => {
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('elapsed')).toMatch(/min-width: 8ch/);
    expect(rule('elapsed')).toMatch(/tabular-nums/);
    expect(rule('elapsed')).toMatch(/white-space: nowrap/);
    expect(rule('line')).toMatch(/white-space: nowrap/);
    expect(rule('buttons')).toMatch(/flex-shrink: 0/);
  });

  function showWithCalls(status: 'recording' | 'paused', fail = false) {
    const calls: string[] = [];
    const listeners = new Map<string, ((payload: never) => void)[]>();
    const backend = {
      call: (name: string) => {
        calls.push(name);
        if (name === 'getRecordingSnapshot') {
          return Promise.resolve({
            state: recording(status),
            pauseSpans: [],
            health: null,
            transcription: null,
          });
        }
        return fail ? Promise.reject(new Error('Could not pause')) : Promise.resolve();
      },
      on: (name: string, listener: (payload: never) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener]);
        return () => undefined;
      },
    } as unknown as Backend;
    render(
      <BackendProvider backend={backend}>
        <MiniRecording />
      </BackendProvider>,
    );
    return calls;
  }

  it('pauses a recording and stops it through the backend, with tooltips', async () => {
    const calls = showWithCalls('recording');
    const pause = await screen.findByRole('button', { name: 'Pause recording' });
    expect(pause.getAttribute('title')).toMatch(/Pause/);
    expect(screen.getByRole('button', { name: 'Stop recording' }).getAttribute('title')).toMatch(
      /Stop recording/,
    );
    fireEvent.click(pause);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await act(async () => undefined);
    expect(calls).toContain('pauseRecording');
    expect(calls).toContain('stopRecording');
  });

  it('offers resume while paused', async () => {
    const calls = showWithCalls('paused');
    fireEvent.click(await screen.findByRole('button', { name: 'Resume recording' }));
    await act(async () => undefined);
    expect(calls).toContain('resumeRecording');
  });

  it('shows a failed pause in the warning slot instead of swallowing it', async () => {
    showWithCalls('recording', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause recording' }));
    expect(await screen.findByText('Could not pause')).toBeTruthy();
  });

  it('explains the compact and return buttons in tooltips', async () => {
    await showRecording(65_000);
    expect(screen.getByRole('button', { name: 'Make smaller' }).getAttribute('title')).toMatch(
      /status row/,
    );
    expect(screen.getByRole('button', { name: 'Show Scribe' }).getAttribute('title')).toMatch(
      /main Scribe window/,
    );
  });

  it('the top row has a fixed height and the time shares the label font', () => {
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('line')).toMatch(/height: 24px/);
    expect(rule('mini')).toMatch(/justify-content: flex-start/);
    expect(rule('elapsed')).not.toMatch(/font-family|font-size/);
  });
});
