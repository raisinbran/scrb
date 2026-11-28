import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertStrip, NoticeStack, NoticeStrip, TOAST_MS, Toast } from './Notices.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NoticeStrip (type A)', () => {
  it('shows the text with the shared X, which dismisses', () => {
    const onDismiss = vi.fn();
    render(
      <NoticeStack>
        <NoticeStrip onDismiss={onDismiss}>Something to know</NoticeStrip>
      </NoticeStack>,
    );
    expect(screen.getByRole('status').textContent).toContain('Something to know');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('has no X when it ends by itself, and can carry one action', () => {
    const run = vi.fn();
    render(
      <NoticeStrip action={{ label: 'Regenerate', onClick: run }}>Still recording</NoticeStrip>,
    );
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(run).toHaveBeenCalled();
  });
});

describe('AlertStrip (type B)', () => {
  it('is an alert with an action and never an X', () => {
    const retry = vi.fn();
    render(<AlertStrip action={{ label: 'Retry', onClick: retry }}>It failed</AlertStrip>);
    expect(screen.getByRole('alert').textContent).toContain('It failed');
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Toast (type C)', () => {
  it('shows one line with no X and goes by itself after about five seconds', () => {
    vi.useFakeTimers();
    const gone = vi.fn();
    render(<Toast message="Copied." onGone={gone} />);
    expect(screen.getByText('Copied.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(screen.getByText('Copied.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText('Copied.')).toBeNull();
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it('shows nothing without a message and restarts its time for a new one', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Toast message={null} />);
    expect(document.body.textContent).toBe('');
    rerender(<Toast message="First" />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    rerender(<Toast message="Second" />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('Second')).toBeTruthy();
  });
});
