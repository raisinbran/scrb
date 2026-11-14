import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment } from '@scrb/contracts';
import { TranscriptTab } from './TranscriptTab.tsx';
import type { TranscriptData } from './use-transcript.ts';

const ROWS = 40;
const ROW_PX = 72;

function data(): TranscriptData {
  const segments: TranscriptSegment[] = Array.from({ length: ROWS }, (_, i) => ({
    id: `invented-${i}`,
    speakerId: 'invented-speaker',
    track: 'meeting',
    startMs: i * 6000,
    endMs: i * 6000 + 5000,
    words: [
      {
        id: `invented-${i}-word`,
        text: 'invented',
        startMs: i * 6000,
        endMs: i * 6000 + 5000,
        state: 'final',
        correctionId: null,
      },
    ],
  }));
  return { segments, speakers: [], totalSegments: ROWS, loading: false, error: null };
}

const transcript = data();
const onPlay = vi.fn();
const onPlace = vi.fn();

function tab(positionMs: number, playing: boolean) {
  return (
    <TranscriptTab
      transcript={transcript}
      gaps={[]}
      fontPx={15}
      positionMs={positionMs}
      showPosition
      playing={playing}
      jump={null}
      onPlay={onPlay}
      onPlace={onPlace}
    />
  );
}

const atRow = (row: number) => row * 6000 + 100;
const banner = () => screen.queryByRole('button', { name: 'Jump to current position' });

describe('TranscriptTab follow-along', () => {
  const scrollTo = vi.fn();
  let reduced = false;

  beforeEach(() => {
    reduced = false;
    scrollTo.mockClear();
    onPlay.mockClear();
    onPlace.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = () => undefined;
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query.includes('reduce'),
    }));
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 300,
    });
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  });

  it('scrolls the current row into view while playing', () => {
    const { rerender } = render(tab(atRow(0), true));
    scrollTo.mockClear();
    rerender(tab(atRow(20), true));
    expect(scrollTo).toHaveBeenCalledWith({ top: 20 * ROW_PX - 24, behavior: 'smooth' });
    expect(banner()).toBeNull();
  });

  it('does not animate the scroll when reduced motion is requested', () => {
    reduced = true;
    const { rerender } = render(tab(atRow(0), true));
    scrollTo.mockClear();
    rerender(tab(atRow(20), true));
    expect(scrollTo).toHaveBeenCalledWith({ top: 20 * ROW_PX - 24, behavior: 'auto' });
  });

  it('does not scroll while paused', () => {
    const { rerender } = render(tab(atRow(0), false));
    rerender(tab(atRow(20), false));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops following when the reader scrolls and offers a button back', () => {
    const { rerender } = render(tab(atRow(0), true));
    fireEvent.wheel(screen.getByRole('region', { name: 'Transcript' }));
    scrollTo.mockClear();
    rerender(tab(atRow(20), true));
    expect(scrollTo).not.toHaveBeenCalled();
    const jump = banner() as HTMLElement;
    expect(jump.tagName).toBe('BUTTON');
    // Showing the banner must not take the focus from where the reader is.
    expect(document.activeElement).not.toBe(jump);
    fireEvent.click(jump);
    expect(banner()).toBeNull();
    expect((screen.getByRole('region', { name: 'Transcript' }) as HTMLElement).scrollTop).toBe(
      20 * ROW_PX - 24,
    );
    rerender(tab(atRow(25), true));
    expect(scrollTo).toHaveBeenCalledWith({ top: 25 * ROW_PX - 24, behavior: 'smooth' });
  });

  it('stops following on scroll keys, but not on Space or the side arrows', () => {
    render(tab(atRow(0), true));
    const region = screen.getByRole('region', { name: 'Transcript' });
    fireEvent.keyDown(region, { key: ' ' });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(banner()).toBeNull();
    fireEvent.keyDown(region, { key: 'PageDown' });
    expect(banner()).toBeTruthy();
  });

  it('stops following on a scroll key from a focused timestamp button', () => {
    render(tab(atRow(0), true));
    const link = screen.getAllByRole('button', { name: /Play from/ })[0] as HTMLElement;
    link.focus();
    fireEvent.keyDown(link, { key: ' ' });
    fireEvent.keyDown(link, { key: 'ArrowLeft' });
    expect(banner()).toBeNull();
    fireEvent.keyDown(link, { key: 'ArrowDown' });
    expect(banner()).toBeTruthy();
  });

  it('follows again when playback restarts', () => {
    const { rerender } = render(tab(atRow(0), true));
    fireEvent.wheel(screen.getByRole('region', { name: 'Transcript' }));
    expect(banner()).toBeTruthy();
    rerender(tab(atRow(0), false));
    rerender(tab(atRow(0), true));
    expect(banner()).toBeNull();
  });

  it('a word click still only places the playhead', () => {
    render(tab(0, false));
    fireEvent.click(document.querySelector('[data-ms]') as HTMLElement);
    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('keeps the current word in view inside a row taller than the list', () => {
    // Old recordings hold one speaker turn of hundreds of words, far taller than the list.
    const words = Array.from({ length: 100 }, (_, i) => ({
      id: `invented-long-${i}`,
      text: 'invented',
      startMs: i * 1000,
      endMs: i * 1000 + 900,
      state: 'final' as const,
      correctionId: null,
    }));
    const long: TranscriptData = {
      segments: [
        {
          id: 'invented-long',
          speakerId: 'invented-speaker',
          track: 'meeting',
          startMs: 0,
          endMs: 100_000,
          words,
        },
      ],
      speakers: [],
      totalSegments: 1,
      loading: false,
      error: null,
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly onResize: (entries: unknown[]) => void) {}
        observe = (target: Element) => {
          if ((target as HTMLElement).dataset['row']) this.onResize([{ target }]);
        };
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 1500,
    });
    // Word 60 sits 900px below the top of a 300px list that is scrolled to 0.
    const rect = (top: number) => ({ top, bottom: top + 20 }) as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-current') === 'true' ? rect(900) : rect(0);
      });
    const view = (ms: number) => (
      <TranscriptTab
        transcript={long}
        gaps={[]}
        fontPx={15}
        positionMs={ms}
        showPosition
        playing
        jump={null}
        onPlay={onPlay}
        onPlace={onPlace}
      />
    );
    const { rerender } = render(view(100));
    scrollTo.mockClear();
    rerender(view(60_100));
    expect(scrollTo).toHaveBeenCalledWith({ top: 900 - 24, behavior: 'smooth' });
    spy.mockRestore();
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
  });
});
