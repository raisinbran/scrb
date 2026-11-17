import { afterEach, describe, expect, it, vi } from 'vitest';
import { animateTranscriptScroll } from './transcript-scroll.ts';

describe('bounded transcript scrolling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accelerates, decelerates and reaches a distant jump in under one second', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++next;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const element = document.createElement('div');
    const progress: number[] = [];
    const finish = vi.fn();
    const tick = (time: number) => {
      const [id, callback] = frames.entries().next().value as [number, FrameRequestCallback];
      frames.delete(id);
      callback(time);
      progress.push(element.scrollTop);
    };

    const cancel = animateTranscriptScroll(element, 200_000, { onComplete: finish });
    expect(cancel).not.toBeNull();
    expect(element.scrollTop).toBe(0);
    tick(0);
    tick(160);
    tick(320);
    tick(480);
    tick(640);
    expect(progress[1]).toBeGreaterThan(0);
    expect(progress[1]).toBeLessThan(200_000 * 0.25);
    expect(progress[3]).toBeGreaterThan(200_000 * 0.75);
    expect(element.scrollTop).toBe(200_000);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('moves immediately for reduced motion without scheduling frames', () => {
    const request = vi.fn();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('requestAnimationFrame', request);
    const element = document.createElement('div');
    const finish = vi.fn();
    expect(animateTranscriptScroll(element, 12_000, { onComplete: finish })).toBeNull();
    expect(element.scrollTop).toBe(12_000);
    expect(finish).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it('cancels an in-flight jump when the reader takes over', () => {
    let scheduled: FrameRequestCallback | null = null;
    const cancelled = vi.fn();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelled);
    const element = document.createElement('div');
    const finish = vi.fn();
    const cancel = animateTranscriptScroll(element, 4000, { onComplete: finish });
    if (!scheduled) throw new Error('animation did not schedule');
    const first = scheduled as FrameRequestCallback;
    first(0);
    cancel?.();
    const position = element.scrollTop;
    (scheduled as FrameRequestCallback)(1000);
    expect(element.scrollTop).toBe(position);
    expect(cancelled).toHaveBeenCalledWith(1);
    expect(finish).not.toHaveBeenCalled();
  });
});
