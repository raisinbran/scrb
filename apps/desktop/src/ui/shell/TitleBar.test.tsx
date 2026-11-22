import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Backend, MeetingListItem } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockModeProvider } from '../lib/mock-mode.tsx';
import { TitleBar } from './TitleBar.tsx';
import { createHybridBackend } from '../lib/hybrid-backend.ts';
import { MockBackend } from '../mocks/index.ts';

const backend = {
  call: () => new Promise(() => undefined),
  on: () => () => undefined,
} as unknown as Backend;

function show(mock: boolean) {
  render(
    <BackendProvider backend={backend}>
      <MockModeProvider mock={mock}>
        <TitleBar />
      </MockModeProvider>
    </BackendProvider>,
  );
}

describe('TitleBar mock marker', () => {
  afterEach(cleanup);
  it('shows when the backend is a mock', () => {
    show(true);
    expect(screen.getByTestId('mock-backend-marker').textContent).toBe('Mock backend');
  });
  it('is absent in real mode', () => {
    show(false);
    expect(screen.queryByTestId('mock-backend-marker')).toBeNull();
  });
});

describe('TitleBar mini window control', () => {
  afterEach(cleanup);
  function showWith(events: Record<string, (payload: unknown) => void>, call = vi.fn()) {
    const fake = {
      call: (name: string) =>
        name === 'showMiniWindow'
          ? (call(name), Promise.resolve(undefined))
          : new Promise(() => undefined),
      on: (name: string, listener: (payload: unknown) => void) => {
        events[name] = listener;
        return () => undefined;
      },
    } as unknown as Backend;
    render(
      <BackendProvider backend={fake}>
        <MockModeProvider mock={false}>
          <TitleBar />
        </MockModeProvider>
      </BackendProvider>,
    );
    return call;
  }
  const recordingState = {
    status: 'recording',
    meetingId: 'm',
    elapsedMs: 1000,
    pauseReason: null,
    privacyBannerRequired: false,
  };

  it('offers the way back only while recording and the mini window is hidden, and asks to show it', () => {
    const events: Record<string, (payload: unknown) => void> = {};
    const call = showWith(events);
    expect(screen.queryByRole('button', { name: 'Show mini window' })).toBeNull();
    act(() => events['recordingStateChanged']?.(recordingState));
    expect(screen.queryByRole('button', { name: 'Show mini window' })).toBeNull();
    act(() => events['miniWindowHiddenChanged']?.({ hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Show mini window' }));
    expect(call).toHaveBeenCalledWith('showMiniWindow');
    act(() => events['miniWindowHiddenChanged']?.({ hidden: false }));
    expect(screen.queryByRole('button', { name: 'Show mini window' })).toBeNull();
  });
});

const processingMeeting = (id: string, status: MeetingListItem['status']): MeetingListItem => ({
  id,
  title: 'Invented meeting',
  startedAt: '2026-11-18T08:00:00Z',
  durationMs: 1000,
  origin: 'recorded',
  status,
  summaryState: 'notGenerated',
  speakerCount: 1,
});

function processingBackend(initial: MeetingListItem[], pending = false) {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  let resolveList: ((meetings: MeetingListItem[]) => void) | undefined;
  let current = initial;
  let first = true;
  const backend = {
    call: (name: string) => {
      if (name !== 'listMeetings') return new Promise(() => undefined);
      if (first && pending) {
        first = false;
        return new Promise<MeetingListItem[]>((resolve) => {
          resolveList = resolve;
        });
      }
      first = false;
      return Promise.resolve(current);
    },
    on: (name: string, listener: (value: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
      return () => listeners.get(name)?.delete(listener);
    },
  } as unknown as Backend;
  return {
    backend,
    emit: (name: string, payload: unknown) =>
      listeners.get(name)?.forEach((listener) => listener(payload)),
    resolve: () => resolveList?.(initial),
    setMeetings: (meetings: MeetingListItem[]) => {
      current = meetings;
    },
  };
}

describe('TitleBar background processing', () => {
  afterEach(cleanup);

  function view(backend: Backend, mock = false, tab = 'Live', realProcessing?: Backend) {
    return (
      <BackendProvider backend={backend} processingBackend={realProcessing ?? backend}>
        <MockModeProvider mock={mock}>
          <TitleBar />
          <main>{tab}</main>
        </MockModeProvider>
      </BackendProvider>
    );
  }

  it.each([
    ['finalPassRunning', 'Final transcription pending · 1 meeting'],
    ['importing', 'Import in progress · 1 meeting'],
  ] as const)('shows initial %s state from listMeetings', async (status, expected) => {
    const source = processingBackend([processingMeeting('m1', status)]);
    render(view(source.backend));
    const label = await screen.findByTestId('background-processing-status');
    expect(label.textContent).toBe(expected);
    expect(label.getAttribute('role')).toBe('status');
    expect(label.getAttribute('aria-live')).toBe('polite');
    expect(label.getAttribute('aria-atomic')).toBe('true');
    expect(label.getAttribute('tabindex')).toBeNull();
  });

  it('counts simultaneous import and final processing without guessing progress', async () => {
    const source = processingBackend([
      processingMeeting('m1', 'finalPassRunning'),
      processingMeeting('m2', 'importing'),
    ]);
    render(view(source.backend));
    expect((await screen.findByTestId('background-processing-status')).textContent).toBe(
      'Background processing pending · 2 meetings',
    );
    expect(screen.queryByText(/\d+%/)).toBeNull();
    act(() => source.emit('meetingChanged', processingMeeting('m1', 'ready')));
    expect(screen.getByTestId('background-processing-status').textContent).toBe(
      'Import in progress · 1 meeting',
    );
    act(() => source.emit('meetingChanged', processingMeeting('m2', 'ready')));
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });

  it.each(['ready', 'transcriptionFailed', 'recovered'] as const)(
    'removes the active label after %s',
    async (status) => {
      const source = processingBackend([processingMeeting('m1', 'finalPassRunning')]);
      render(view(source.backend));
      await screen.findByTestId('background-processing-status');
      act(() => source.emit('meetingChanged', processingMeeting('m1', status)));
      expect(screen.queryByTestId('background-processing-status')).toBeNull();
    },
  );

  it('stays visible as the tab content changes without remounting the title bar', async () => {
    const source = processingBackend([processingMeeting('m1', 'finalPassRunning')]);
    const rendered = render(view(source.backend, false, 'Live'));
    await screen.findByTestId('background-processing-status');
    rendered.rerender(view(source.backend, false, 'Settings'));
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByTestId('background-processing-status').textContent).toBe(
      'Final transcription pending · 1 meeting',
    );
    rendered.rerender(view(source.backend, false, 'Recordings'));
    expect(screen.getByTestId('background-processing-status')).toBeTruthy();
  });

  it('does not show a processing label when idle or in simulated backend mode', async () => {
    const idle = processingBackend([processingMeeting('m1', 'ready')]);
    const rendered = render(view(idle.backend));
    await act(async () => Promise.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    const simulated = processingBackend([processingMeeting('m1', 'finalPassRunning')]);
    rendered.rerender(view(simulated.backend, true));
    await act(async () => Promise.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    expect(screen.getByTestId('mock-backend-marker')).toBeTruthy();
  });

  it('does not revive a completed job from a late list response', async () => {
    const source = processingBackend([processingMeeting('m1', 'finalPassRunning')], true);
    render(view(source.backend));
    act(() => source.emit('meetingChanged', processingMeeting('m1', 'ready')));
    await act(async () => source.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });

  it('does not discard a newer processing event when an older idle list arrives', async () => {
    const source = processingBackend([processingMeeting('m1', 'ready')], true);
    render(view(source.backend));
    act(() => source.emit('meetingChanged', processingMeeting('m1', 'finalPassRunning')));
    expect(screen.getByTestId('background-processing-status')).toBeTruthy();
    await act(async () => source.resolve());
    expect(screen.getByTestId('background-processing-status').textContent).toBe(
      'Final transcription pending · 1 meeting',
    );
  });

  it('clears old backend state immediately and ignores its late list response', async () => {
    const old = processingBackend([processingMeeting('m1', 'finalPassRunning')]);
    const next = processingBackend([], true);
    const rendered = render(view(old.backend));
    await screen.findByTestId('background-processing-status');
    rendered.rerender(view(next.backend));
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    act(() => old.emit('meetingChanged', processingMeeting('m1', 'finalPassRunning')));
    await act(async () => next.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });

  it('does not mistake the actual hybrid mock fixture for a real final pass', async () => {
    const mock = new MockBackend();
    const realSource = processingBackend([]);
    const real = {
      call: (name: string, request?: unknown) =>
        name === 'getSettings'
          ? mock.call('getSettings')
          : (realSource.backend.call as (name: string, request?: unknown) => Promise<unknown>)(
              name,
              request,
            ),
      on: realSource.backend.on,
    } as unknown as Backend;
    const hybrid = createHybridBackend(real, mock);
    const listed = await hybrid.call('listMeetings', {});
    expect(listed.some((meeting) => meeting.status === 'finalPassRunning')).toBe(true);

    render(view(hybrid, false, 'Settings', real));
    await act(async () => Promise.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    act(() => realSource.emit('meetingChanged', processingMeeting('real', 'importing')));
    expect(screen.getByTestId('background-processing-status').textContent).toBe(
      'Import in progress · 1 meeting',
    );
    act(() => realSource.emit('meetingChanged', processingMeeting('real', 'ready')));
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    mock.dispose();
  });

  it('ignores sample processing from a mixed backend and follows only real events across tabs', async () => {
    // A hybrid backend can include a mock meeting marked finalPassRunning even when real is idle.
    const mixed = processingBackend([processingMeeting('demo', 'finalPassRunning')]);
    const real = processingBackend([processingMeeting('actual', 'ready')]);
    const rendered = render(view(mixed.backend, false, 'Live', real.backend));
    await act(async () => Promise.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();

    // Mock data can change without producing a claim about actual background processing.
    act(() => mixed.emit('meetingChanged', processingMeeting('demo', 'importing')));
    expect(screen.queryByTestId('background-processing-status')).toBeNull();

    act(() => real.emit('meetingChanged', processingMeeting('actual', 'finalPassRunning')));
    expect(screen.getByRole('status').textContent).toBe('Final transcription pending · 1 meeting');
    rendered.rerender(view(mixed.backend, false, 'Settings', real.backend));
    expect(screen.getByTestId('background-processing-status')).toBeTruthy();
    rendered.rerender(view(mixed.backend, false, 'Recordings', real.backend));
    expect(screen.getByTestId('background-processing-status')).toBeTruthy();

    act(() => real.emit('meetingChanged', processingMeeting('actual', 'transcriptionFailed')));
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });

  it('shows real final work despite idle mock data and clears stale real backend state', async () => {
    const mixed = processingBackend([processingMeeting('demo', 'ready')]);
    const real = processingBackend([processingMeeting('actual', 'finalPassRunning')]);
    const newerReal = processingBackend([processingMeeting('other', 'ready')], true);
    const rendered = render(view(mixed.backend, false, 'Live', real.backend));
    expect((await screen.findByTestId('background-processing-status')).textContent).toBe(
      'Final transcription pending · 1 meeting',
    );

    rendered.rerender(view(mixed.backend, false, 'Settings', newerReal.backend));
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    act(() => real.emit('meetingChanged', processingMeeting('actual', 'finalPassRunning')));
    await act(async () => newerReal.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });

  it('leaves the existing keyboard-operable mini-window button focused', async () => {
    const source = processingBackend([processingMeeting('m1', 'finalPassRunning')]);
    render(view(source.backend));
    await screen.findByTestId('background-processing-status');
    act(() => {
      source.emit('recordingStateChanged', {
        status: 'recording',
        meetingId: 'm1',
        elapsedMs: 1000,
        pauseReason: null,
        privacyBannerRequired: false,
      });
      source.emit('miniWindowHiddenChanged', { hidden: true });
    });
    const button = screen.getByRole('button', { name: 'Show mini window' });
    button.focus();
    expect(document.activeElement).toBe(button);
    act(() => source.emit('meetingChanged', processingMeeting('m1', 'ready')));
    expect(document.activeElement).toBe(button);
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });
  it.each(['importFinished', 'importFailed', 'importCancelled'] as const)(
    'reconciles a removed import on %s without a meetingChanged event',
    async (event) => {
      const source = processingBackend([processingMeeting('m1', 'importing')]);
      render(view(source.backend));
      await screen.findByTestId('background-processing-status');
      // Import cleanup deletes the meeting row without emitting another meetingChanged.
      source.setMeetings([]);
      await act(async () => {
        source.emit(event, { importId: 'invented', meetingId: 'm1' });
      });
      expect(screen.queryByTestId('background-processing-status')).toBeNull();
    },
  );

  it('ignores a late initial list after an import failure has been reconciled', async () => {
    const source = processingBackend([processingMeeting('m1', 'importing')], true);
    render(view(source.backend));
    act(() => source.emit('meetingChanged', processingMeeting('m1', 'importing')));
    expect(screen.getByTestId('background-processing-status')).toBeTruthy();
    source.setMeetings([]);
    await act(async () => {
      source.emit('importFailed', { importId: 'invented' });
    });
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
    await act(async () => source.resolve());
    expect(screen.queryByTestId('background-processing-status')).toBeNull();
  });
});
