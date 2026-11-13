import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_MS, fadeOpacity } from './mini-fade.ts';

describe('fadeOpacity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('steps from start to end over the duration, then calls done once', () => {
    const values: number[] = [];
    const done = vi.fn();
    fadeOpacity({ setOpacity: (v) => values.push(v), from: 0, to: 1, reducedMotion: false, done });
    expect(values).toEqual([0]);
    vi.advanceTimersByTime(FADE_MS / 2);
    expect(values.at(-1)).toBeGreaterThan(0);
    expect(values.at(-1)).toBeLessThan(1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FADE_MS);
    expect(values.at(-1)).toBe(1);
    expect(done).toHaveBeenCalledTimes(1);
    const count = values.length;
    vi.advanceTimersByTime(500);
    expect(values.length).toBe(count);
  });

  it('fades out to zero', () => {
    const values: number[] = [];
    fadeOpacity({ setOpacity: (v) => values.push(v), from: 1, to: 0, reducedMotion: false });
    vi.advanceTimersByTime(FADE_MS + 20);
    expect(values.at(-1)).toBe(0);
  });

  it('skips the animation with reduced motion', () => {
    const setOpacity = vi.fn();
    const done = vi.fn();
    fadeOpacity({ setOpacity, from: 1, to: 0, reducedMotion: true, done });
    expect(setOpacity).toHaveBeenCalledExactlyOnceWith(0);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('cancel stops the steps without calling done', () => {
    const setOpacity = vi.fn();
    const done = vi.fn();
    const cancel = fadeOpacity({ setOpacity, from: 0, to: 1, reducedMotion: false, done });
    vi.advanceTimersByTime(50);
    cancel();
    const calls = setOpacity.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(setOpacity.mock.calls.length).toBe(calls);
    expect(done).not.toHaveBeenCalled();
  });
});
