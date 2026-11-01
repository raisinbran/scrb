import { cleanup, render } from '@testing-library/react';
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

  it('measures the viewport when the first text arrives after an empty start', () => {
    const { container, rerender } = render(<TranscriptTab transcript={data(0)} {...props} />);
    rerender(<TranscriptTab transcript={data(3)} {...props} />);
    expect(observed).toContain(container.querySelector('[role="region"]'));
  });
});
