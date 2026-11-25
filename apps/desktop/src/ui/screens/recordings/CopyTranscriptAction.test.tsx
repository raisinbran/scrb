import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Speaker, TranscriptSegment } from '@scrb/contracts';
import { CopyTranscriptAction } from './CopyTranscriptAction.tsx';
import type { TranscriptData } from './use-transcript.ts';

const speakers: Speaker[] = [
  {
    id: 'speaker-a',
    label: 'Speaker A',
    kind: 'unknown',
    profileId: null,
  },
];

function segment(index: number, text = `text-${index}`): TranscriptSegment {
  const startMs = index * 1000;
  return {
    id: `segment-${index}`,
    speakerId: 'speaker-a',
    track: 'meeting',
    startMs,
    endMs: startMs + 500,
    words: [
      {
        id: `word-${index}`,
        text,
        startMs,
        endMs: startMs + 500,
        state: text === 'corrected-word' ? 'corrected' : 'final',
        correctionId: text === 'corrected-word' ? 'correction-1' : null,
      },
    ],
  };
}

function data(
  segments: TranscriptSegment[],
  overrides: Partial<TranscriptData> = {},
): TranscriptData {
  return {
    segments,
    speakers,
    totalSegments: segments.length,
    loading: false,
    error: null,
    ...overrides,
  };
}

let originalExecCommand: PropertyDescriptor | undefined;

afterEach(() => {
  cleanup();
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else Reflect.deleteProperty(document, 'execCommand');
  originalExecCommand = undefined;
  vi.restoreAllMocks();
});

describe('CopyTranscriptAction', () => {
  it('uses the standard labelled overlapping-documents copy icon', () => {
    render(<CopyTranscriptAction transcript={data([segment(0)])} />);
    const control = screen.getByRole('button', { name: 'Copy transcript' });
    expect(control.querySelector('svg path')?.getAttribute('d')).toMatch(/^M10 8h10/);
    expect(control.textContent).toBe('');
  });

  it('copies all 4,800 segments with labels, corrected words, and chronological order', async () => {
    const segments = Array.from({ length: 4800 }, (_, index) => segment(4799 - index));
    segments[2399] = segment(2400, 'corrected-word');
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyTranscriptAction transcript={data(segments)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy transcript' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0]?.[0] as string;
    const lines = copied.split('\n');
    expect(lines).toHaveLength(4800);
    expect(lines[0]).toBe('Speaker A: text-0');
    expect(lines[2400]).toBe('Speaker A: corrected-word');
    expect(lines.at(-1)).toBe('Speaker A: text-4799');
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Transcript copied.'),
    );
  });

  it('shows a check after a successful copy, then the copy icon returns', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CopyTranscriptAction transcript={data([segment(0)])} />);
    const path = () =>
      screen
        .getByRole('button', { name: 'Copy transcript' })
        .querySelector('svg path')
        ?.getAttribute('d');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy transcript' }));
      await vi.waitFor(() => expect(path()).toMatch(/^M5 12.5/));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(path()).toMatch(/^M5 12.5/);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(path()).toMatch(/^M10 8h10/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables copying until every segment is loaded or when loading failed', () => {
    const partial = data([segment(0)], { totalSegments: 2, loading: true });
    const { rerender } = render(<CopyTranscriptAction transcript={partial} />);
    expect(screen.getByRole('button', { name: 'Copy transcript' }).hasAttribute('disabled')).toBe(
      true,
    );

    rerender(
      <CopyTranscriptAction
        transcript={data([segment(0)], { totalSegments: 2, error: 'Page failed.' })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Copy transcript' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('reports clipboard rejection when both clipboard paths fail', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const onError = vi.fn();
    render(<CopyTranscriptAction transcript={data([segment(0)])} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy transcript' }));
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith('The transcript could not be copied.'),
    );
  });

  it('removes the fallback textarea when the copy command throws', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        throw new Error('copy failed');
      },
    });
    const onError = vi.fn();
    render(<CopyTranscriptAction transcript={data([segment(0)])} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy transcript' }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
