import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment } from '@scrb/contracts';
import { TranscriptTab } from './TranscriptTab.tsx';
import type { TranscriptData } from './use-transcript.ts';

function eightHours(): TranscriptData {
  const segments: TranscriptSegment[] = Array.from({ length: 4800 }, (_, i) => {
    const startMs = i * 6000;
    return {
      id: `invented-segment-${i}`,
      speakerId: 'synthetic',
      track: 'meeting',
      startMs,
      endMs: startMs + 3000,
      words: [{
        id: `invented-word-${i}`,
        text: 'invented',
        startMs,
        endMs: startMs + 3000,
        state: 'final',
        correctionId: null,
      }],
    };
  });
  return {
    segments,
    speakers: [{
      id: 'synthetic',
      label: 'Invented Speaker',
      kind: 'unknown',
      profileId: null,
    }],
    totalSegments: segments.length,
    loading: false,
    error: null,
  };
}

afterEach(() => cleanup());

describe('eight-hour transcript keyboard accessibility', () => {
  it('keeps scroller focus and a bounded row count across far-apart timeline jumps', () => {
    const onPlay = vi.fn();
    const transcript = eightHours();
    const props = {
      transcript,
      gaps: [],
      fontPx: 28,
      positionMs: 0,
      showPosition: false,
      jump: null,
      onPlay,
    };
    const { rerender } = render(<TranscriptTab {...props} />);
    const region = screen.getByRole('region', { name: 'Transcript' });
    expect(region.getAttribute('tabindex')).toBe('0');
    (region as HTMLElement).focus();
    expect(document.activeElement).toBe(region);
    expect(screen.getAllByRole('button', { name: /Play from/ }).length).toBeLessThan(100);

    rerender(<TranscriptTab {...props} jump={{ ms: 28_000_000, nonce: 1 }} />);
    fireEvent.scroll(region);
    expect((region as HTMLElement).scrollTop).toBeGreaterThan(0);
    expect(document.activeElement).toBe(region);
    const endLinks = screen.getAllByRole('button', { name: /Play from/ });
    expect(endLinks.length).toBeGreaterThan(0);
    expect(endLinks.length).toBeLessThan(100);
    endLinks[0]?.focus();
    fireEvent.click(endLinks[0] as HTMLElement);
    expect(onPlay).toHaveBeenCalledOnce();
    expect(Number(onPlay.mock.calls[0]?.[0])).toBeGreaterThan(0);
  });

  it('labels a gap in the virtualized transcript without announcing it repeatedly', () => {
    const transcript = eightHours();
    render(
      <TranscriptTab
        transcript={transcript}
        gaps={[{ kind: 'paused', track: 'both', startMs: 1000, endMs: 4000 }]}
        fontPx={16}
        positionMs={0}
        showPosition={false}
        jump={null}
        onPlay={() => undefined}
      />,
    );
    expect(screen.getByText(/Paused,/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
