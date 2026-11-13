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
});
