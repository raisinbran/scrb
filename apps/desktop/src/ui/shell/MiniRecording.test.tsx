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
    expect(screen.getByRole('status').textContent).toMatch(/Recording/);
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
    expect(screen.getByRole('status').textContent).toBe('Recording 01:05');
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

  const transcript = (
    meetingId: string,
    label: string,
    track: 'microphone' | 'meeting' = 'microphone',
  ) => ({
    meetingId,
    revision: 1,
    change: {
      kind: 'append',
      segments: [
        {
          id: 's',
          speakerId: 'a',
          track,
          startMs: 8000,
          endMs: 9000,
          words: [
            {
              id: 'w',
              text: 'secretwords',
              startMs: 8000,
              endMs: 9000,
              state: 'final',
              correctionId: null,
            },
          ],
        },
      ],
    },
    speakers: [{ id: 'a', label, kind: 'unknown', profileId: null }],
  });

  async function startRecording(fake: ReturnType<typeof fakeBackend>) {
    await act(async () =>
      fake.snapshot({
        state: recording('recording', 10_000),
        pauseSpans: [],
        health: null,
        transcription: null,
      }),
    );
  }

  it('shows no speaker label while nobody is above the noise, even after the transcript names one', async () => {
    const fake = fakeBackend();
    show(fake);
    await startRecording(fake);
    act(() => fake.emit('transcriptChanged', transcript('invented-meeting', 'You')));
    act(() => fake.emit('levelMeter', { micDb: -55, meetingDb: -70 }));
    expect(screen.queryByText('You')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Speaking' })).toBeNull();
  });

  it('shows a label with moving bars as soon as a track is loud, without waiting for the transcript', async () => {
    const fake = fakeBackend();
    show(fake);
    await startRecording(fake);
    act(() => fake.emit('levelMeter', { micDb: -20, meetingDb: null }));
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Speaking' })).toBeTruthy();
    act(() => fake.emit('levelMeter', { micDb: -20, meetingDb: -25 }));
    expect(screen.getByText('Meeting')).toBeTruthy();
  });

  it('names the meeting track from the transcript, never showing words, and clears when quiet', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeBackend();
      show(fake);
      await startRecording(fake);
      act(() => fake.emit('transcriptChanged', transcript('invented-meeting', 'Ana', 'meeting')));
      act(() => fake.emit('levelMeter', { micDb: -80, meetingDb: -20 }));
      expect(screen.getByText('Ana')).toBeTruthy();
      expect(document.body.textContent).not.toContain('secretwords');
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText('Ana')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws the bars still when motion is reduced', () => {
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*animation: eq/);
    expect(css).not.toMatch(/^\.bars i \{[^}]*animation:/m);
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
    await startRecording(fake);
    act(() => fake.emit('transcriptChanged', transcript('invented-meeting', 'Ana')));
    act(() => fake.emit('transcriptChanged', transcript('other-meeting', 'Ben')));
    act(() => fake.emit('levelMeter', { micDb: -20, meetingDb: null }));
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

  it('has Resume, Stop, Hide, Open Scribe in that order, each named, and no expand toggle', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    await showRecording(65_000);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Resume recording',
      'Stop recording',
      'Hide mini window',
      'Show Scribe',
    ]);
    expect(screen.queryByRole('button', { name: /Make (smaller|larger)/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide mini window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Scribe' }));
    expect(open.mock.calls).toEqual([['scrb-app://mini-hide'], ['scrb-app://show-main']]);
    expect(screen.getByRole('button', { name: 'Hide mini window' }).dataset.tip).toBe(
      'Hide (recording continues)',
    );
  });

  it('keeps a long, multiline warning inside the window on hover and keyboard focus', async () => {
    const long =
      'The microphone changed.\nScribe switched to the built-in microphone for this meeting.';
    await showRecording(65_000, {
      ...warned,
      warnings: [{ kind: 'deviceChanged', message: long, atMs: 1000 }],
    });
    const flag = screen.getByRole('img', { name: long });
    fireEvent.mouseOver(flag);
    fireEvent.focus(flag);
    expect(flag.dataset.tip).toBe(long);
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const rule = css.match(/\.flag\[data-tip\]::after \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position: fixed/);
    expect(rule).toMatch(/left:/);
    expect(rule).toMatch(/right:/);
    expect(rule).toMatch(/white-space: normal/);
    expect(rule).toMatch(/line-clamp: 4/);
    expect(css).toMatch(/\[data-tip\]:focus-visible::after/);
  });

  it('shows the warning flag with the warning as its tooltip and name, reachable by keyboard', async () => {
    await showRecording(65_000, warned);
    const flag = screen.getByRole('img', { name: 'Microphone changed' });
    expect(flag.dataset.tip).toBe('Microphone changed');
    expect(flag.getAttribute('tabindex')).toBe('0');
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    expect(css).toMatch(/\.flag\[data-tip\]::after/);
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
    expect(pause.dataset.tip).toBe('Pause');
    expect(screen.getByRole('button', { name: 'Stop recording' }).dataset.tip).toBe(
      'Stop and save',
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

  it('explains the return button in a tooltip', async () => {
    await showRecording(65_000);
    expect(screen.getByRole('button', { name: 'Show Scribe' }).dataset.tip).toBe('Open Scribe');
  });

  it('never shows a transcription-behind status, whatever the lag', async () => {
    const fake = fakeBackend();
    show(fake);
    await act(async () =>
      fake.snapshot({
        state: recording('recording'),
        pauseSpans: [],
        health: null,
        transcription: { status: 'lagging', lagMs: 90_000 } as never,
      }),
    );
    expect(document.body.textContent).not.toMatch(/behind|catching up/i);
    expect(screen.queryByText(/Transcription/)).toBeNull();
  });

  it('still offers Hide when nothing is recording, so the window is never stuck', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const fake = fakeBackend();
    show(fake);
    await act(async () =>
      fake.snapshot({
        state: recording('idle', 0),
        pauseSpans: [],
        health: null,
        transcription: null,
      }),
    );
    expect(screen.getByText('Not recording')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide mini window' }));
    expect(open).toHaveBeenCalledWith('scrb-app://mini-hide');
  });

  it('has one Hide control, an ordinary button in the same row as the others', async () => {
    await showRecording(65_000);
    const hide = screen.getByRole('button', { name: 'Hide mini window' });
    const stop = screen.getByRole('button', { name: 'Show Scribe' });
    expect(hide.parentElement).toBe(stop.parentElement);
    expect(hide.className).toBe(stop.className);
    expect(screen.getAllByRole('button', { name: 'Hide mini window' })).toHaveLength(1);
  });

  it('shows tooltips from CSS within 400 ms, with no slow native title on the buttons', async () => {
    await showRecording(65_000);
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('title')).toBeNull();
      expect(button.dataset.tip).toBeTruthy();
    }
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const delay = css.match(/\[data-tip\]:hover::after[^{]*\{[^}]*transition-delay: (\d+)ms/);
    expect(Number(delay?.[1])).toBeLessThanOrEqual(400);
    expect(css).toMatch(/\[data-tip\]:focus-visible::after/);
  });

  it('no button changes size with its state: pause and resume share one box', () => {
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const rule = css.match(/\.icon \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/width: 24px/);
    expect(rule).toMatch(/height: 24px/);
  });

  it('the top row has a fixed height and the time shares the label font', () => {
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('line')).toMatch(/height: 24px/);
    expect(css).toMatch(/\.body,\s*\.idle \{[^}]*justify-content: flex-start/);
    expect(rule('elapsed')).not.toMatch(/font-family|font-size/);
  });

  it('uses only the shared corner radius token, which tokens.css defines', () => {
    const css = readFileSync(path.resolve(__dirname, 'MiniRecording.module.css'), 'utf8');
    const tokens = readFileSync(path.resolve(__dirname, '../theme/tokens.css'), 'utf8');
    const used = new Set(css.match(/var\(--radius[\w-]*\)/g));
    expect([...used]).toEqual(['var(--radius)']);
    expect(tokens).toMatch(/--radius:/);
    expect(css).not.toMatch(/border-radius: \d+px/);
  });
});
