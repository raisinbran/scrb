import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Speaker, TranscriptSegment } from '@scrb/contracts';
import { TranscriptTab } from './TranscriptTab.tsx';
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

const props = {
  gaps: [],
  fontPx: 15,
  positionMs: 0,
  showPosition: false,
  jump: null,
  onPlay: () => undefined,
  onPlace: () => undefined,
};

let originalExecCommand: PropertyDescriptor | undefined;

afterEach(() => {
  cleanup();
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else Reflect.deleteProperty(document, 'execCommand');
  originalExecCommand = undefined;
  vi.restoreAllMocks();
});

describe('TranscriptTab copy action', () => {
  it('copies all 4,800 segments with labels, corrected words, and chronological order', async () => {
    const segments = Array.from({ length: 4800 }, (_, index) => segment(4799 - index));
    segments[2399] = segment(2400, 'corrected-word');
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<TranscriptTab transcript={data(segments)} {...props} />);

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

  it('disables copying until every segment is loaded or when loading failed', () => {
    const partial = data([segment(0)], { totalSegments: 2, loading: true });
    const { rerender } = render(<TranscriptTab transcript={partial} {...props} />);
    expect(screen.getByRole('button', { name: 'Copy transcript' }).hasAttribute('disabled')).toBe(
      true,
    );

    rerender(
      <TranscriptTab
        transcript={data([segment(0)], { totalSegments: 2, error: 'Page failed.' })}
        {...props}
      />,
    );
    expect(screen.getByRole('button', { name: 'Copy transcript' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('alert').textContent).toBe('Page failed.');
  });

  it('reports clipboard rejection', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<TranscriptTab transcript={data([segment(0)])} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy transcript' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The transcript could not be copied.',
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
    render(<TranscriptTab transcript={data([segment(0)])} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy transcript' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
