import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment } from '@scrb/contracts';
import { TranscriptTab } from './TranscriptTab.tsx';
import type { TranscriptData } from './use-transcript.ts';

function data(rows: number): TranscriptData {
  const segments: TranscriptSegment[] = Array.from({ length: rows }, (_, i) => ({
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
  return { segments, speakers: [], totalSegments: rows, loading: false, error: null };
}

const props = {
  gaps: [],
  fontPx: 15,
  positionMs: 0,
  showPosition: false,
  jump: null,
  onPlay: () => undefined,
  onPlace: () => undefined,
};

describe('TranscriptTab sizing', () => {
  const observed: Element[] = [];

  beforeEach(() => {
    observed.length = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = (element: Element) => observed.push(element);
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('measures the rows of an already loaded 8-hour transcript on reopening the tab', () => {
    const { container } = render(<TranscriptTab transcript={data(4800)} {...props} />);
    const rows = container.querySelectorAll('[data-row]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(40);
    expect(observed).toEqual(expect.arrayContaining([...rows]));
  });

  it('marks only the word being spoken, and only while a position is shown', () => {
    const transcript = data(2);
    transcript.segments[0]!.words = ['one', 'two'].map((text, i) => ({
      id: `w${i}`,
      text,
      startMs: i * 2000,
      endMs: i * 2000 + 1500,
      state: 'final' as const,
      correctionId: null,
    }));
    const { container, rerender } = render(<TranscriptTab transcript={transcript} {...props} />);
    expect(container.querySelector('[data-ms][aria-current]')).toBeNull();
    rerender(<TranscriptTab transcript={transcript} {...props} showPosition positionMs={2100} />);
    const current = container.querySelectorAll('[data-ms][aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toBe('two');
  });

  it('moves the playhead to a clicked word without playing, also when it is provisional', () => {
    const transcript = data(1);
    transcript.segments[0]!.words = ['one', 'two'].map((text, i) => ({
      id: `w${i}`,
      text,
      startMs: i * 2000,
      endMs: i * 2000 + 1500,
      state: i === 1 ? ('provisional' as const) : ('final' as const),
      correctionId: null,
    }));
    const played: number[] = [];
    function Harness() {
      const [position, setPosition] = useState(0);
      return (
        <TranscriptTab
          transcript={transcript}
          {...props}
          showPosition
          positionMs={position}
          onPlay={(ms) => played.push(ms)}
          onPlace={setPosition}
        />
      );
    }
    const { container } = render(<Harness />);
    const word = (text: string) =>
      [...container.querySelectorAll<HTMLElement>('[data-ms]')].find(
        (el) => el.textContent === text,
      )!;
    expect(word('one').getAttribute('aria-current')).toBe('true');
    fireEvent.click(word('two'));
    expect(played).toEqual([]);
    expect(word('two').getAttribute('aria-current')).toBe('true');
    expect(word('one').getAttribute('aria-current')).toBeNull();
    expect(word('two').className).toMatch(/wordCurrent/);
  });

  it('highlights the clicked word, not a short overlapping turn that started later', () => {
    const word = (id: string, text: string, startMs: number, endMs: number) => ({
      id,
      text,
      startMs,
      endMs,
      state: 'final' as const,
      correctionId: null,
    });
    const transcript = data(2);
    transcript.segments[0]!.words = ['a1', 'a2', 'a3'].map((id, i) =>
      word(id, id, i * 3000, i * 3000 + 2500),
    );
    transcript.segments[1]!.startMs = 1000;
    transcript.segments[1]!.words = [word('b1', 'b1', 1000, 1500)];
    transcript.segments.sort((a, b) => a.startMs - b.startMs);
    const played: number[] = [];
    function Harness() {
      const [position, setPosition] = useState(0);
      return (
        <TranscriptTab
          transcript={transcript}
          {...props}
          showPosition
          positionMs={position}
          onPlay={(ms) => played.push(ms)}
          onPlace={setPosition}
        />
      );
    }
    const { container } = render(<Harness />);
    const find = (text: string) =>
      [...container.querySelectorAll<HTMLElement>('[data-ms]')].find(
        (el) => el.textContent === text,
      )!;
    fireEvent.click(find('a3'));
    expect(find('a3').getAttribute('aria-current')).toBe('true');
    expect(find('b1').getAttribute('aria-current')).toBeNull();
    expect(played).toEqual([]);
  });

  it('declares the current-word colour after every word-state colour', () => {
    const css = readFileSync(join(import.meta.dirname, 'recordings.module.css'), 'utf8');
    const current = css.indexOf('.wordCurrent {');
    expect(current).toBeGreaterThan(css.indexOf('.wordProvisional {'));
    expect(current).toBeGreaterThan(css.indexOf('.wordCorrected {'));
  });

  it('measures the viewport when the first text arrives after an empty start', () => {
    const { container, rerender } = render(<TranscriptTab transcript={data(0)} {...props} />);
    rerender(<TranscriptTab transcript={data(3)} {...props} />);
    expect(observed).toContain(container.querySelector('[role="region"]'));
  });
});
