import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockModeProvider } from '../lib/mock-mode.tsx';
import { TitleBar } from './TitleBar.tsx';

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
