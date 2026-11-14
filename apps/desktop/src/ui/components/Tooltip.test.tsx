import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip, TOOLTIP_DELAY_MS } from './Tooltip.tsx';

function setup() {
  render(
    <Tooltip label="Delete">
      <button type="button">x</button>
    </Tooltip>,
  );
  return screen.getByRole('button');
}
const tip = () => document.querySelector('[role="tooltip"]') as HTMLElement;

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows after the hover delay, not before', () => {
    const button = setup();
    fireEvent.pointerEnter(button.parentElement as HTMLElement);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1));
    expect(tip().hidden).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(tip().hidden).toBe(false);
    expect(button.getAttribute('aria-describedby')).toBe(tip().id);
  });

  it('shows at once on keyboard focus and hides on Escape', () => {
    const button = setup();
    fireEvent.focus(button);
    expect(tip().hidden).toBe(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tip().hidden).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeNull();
  });

  it('hides on leave and cancels a pending show', () => {
    const button = setup();
    const wrapper = button.parentElement as HTMLElement;
    fireEvent.pointerEnter(wrapper);
    fireEvent.pointerLeave(wrapper);
    act(() => void vi.advanceTimersByTime(1000));
    expect(tip().hidden).toBe(true);
  });
});
