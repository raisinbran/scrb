import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip.tsx';

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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows immediately on pointer enter without a timer', () => {
    const button = setup();
    fireEvent.pointerEnter(button.parentElement as HTMLElement);
    expect(tip().dataset.open).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe(tip().id);
  });

  it('shows at once on keyboard focus and hides on Escape', () => {
    const button = setup();
    fireEvent.focus(button);
    expect(tip().dataset.open).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tip().dataset.open).toBeUndefined();
    expect(button.getAttribute('aria-describedby')).toBeNull();
  });

  it('hides immediately on leave and stays hidden until another entry', () => {
    const button = setup();
    const wrapper = button.parentElement as HTMLElement;
    fireEvent.pointerEnter(wrapper);
    expect(tip().dataset.open).toBe('true');
    fireEvent.pointerLeave(wrapper);
    expect(tip().dataset.open).toBeUndefined();
    expect(button.getAttribute('aria-describedby')).toBeNull();
    fireEvent.pointerEnter(wrapper);
    expect(tip().dataset.open).toBe('true');
  });

  it('keeps a bottom-left tooltip inside the viewport by placing it above the control', () => {
    const button = setup();
    const wrapper = button.parentElement as HTMLElement;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 676,
      left: 0,
      top: 676,
      right: 36,
      bottom: 712,
      width: 36,
      height: 36,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(tip(), 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 30,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    } as DOMRect);
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 720);

    fireEvent.focus(button);

    expect(tip().style.left).toBe('58px');
    expect(tip().style.top).toBe('640px');
    expect(tip().dataset.open).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe(tip().id);
  });

  it('does not open a closed tooltip when the window resizes', () => {
    const button = setup();
    fireEvent(window, new Event('resize'));
    expect(tip().dataset.open).toBeUndefined();
    expect(button.getAttribute('aria-describedby')).toBeNull();
  });
});
