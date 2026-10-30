import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockBackend } from '../mocks/index.ts';
import { DEV_TRIGGERS } from '../mocks/dev-triggers.ts';
import { LiveScreen } from './LiveScreen.tsx';

let backend: MockBackend;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const trigger = (id: string) => {
  act(() => DEV_TRIGGERS.find((item) => item.id === id)?.run(backend));
  return advance(0);
};
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const transcript = () => screen.getByTestId('transcript');
const words = () => [...document.querySelectorAll<HTMLElement>('[data-word-id]')];
const selected = () => [...document.querySelectorAll('[data-selected]')].map((w) => w.textContent);

async function renderLive() {
  render(
    <BackendProvider backend={backend}>
      <LiveScreen />
    </BackendProvider>,
  );
  await advance(0);
}

async function startMeeting(seconds = 3) {
  await renderLive();
  fireEvent.click(button('Start'));
  await advance(seconds * 1000);
}

function clickWord(word: HTMLElement) {
  fireEvent.mouseDown(word, { detail: 1 });
  fireEvent.mouseUp(word, { detail: 1 });
}

function dragAcross(from: HTMLElement, to: HTMLElement) {
  fireEvent.mouseDown(from);
  fireEvent.mouseMove(to);
  fireEvent.mouseUp(to);
}

describe('LiveScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    backend = new MockBackend();
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
    vi.useRealTimers();
  });

  describe('recording controls', () => {
    it('moves through idle, recording, paused and stopped', async () => {
      await renderLive();
      expect(screen.getByText('Not recording')).toBeTruthy();

      fireEvent.click(button('Start'));
      await advance(2000);
      expect(screen.getByText('00:02')).toBeTruthy();

      fireEvent.click(button('Pause'));
      await advance(3000);
      expect(screen.getByText('Paused')).toBeTruthy();
      expect(screen.getByText('00:02')).toBeTruthy();

      fireEvent.click(button('Resume'));
      await advance(1000);
      expect(screen.getByText('00:03')).toBeTruthy();

      fireEvent.click(button('Stop'));
      await advance(0);
      expect(button('Start')).toBeTruthy();
      expect(screen.getByText(/final pass is running/)).toBeTruthy();
      expect(words().length).toBeGreaterThan(0);
    });

    it('shows why a start was refused', async () => {
      await renderLive();
      await trigger('start-denied');
      fireEvent.click(button('Start'));
      await advance(0);
      expect(screen.getByRole('alert').textContent).toContain('permission');
      expect(button('Start')).toBeTruthy();
    });

    it('has keyboard shortcuts for start, pause and stop', async () => {
      await renderLive();
      fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
      await advance(1000);
      expect(button('Pause')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true });
      await advance(0);
      expect(button('Resume')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
      await advance(0);
      expect(button('Start')).toBeTruthy();
    });
  });

  describe('sources', () => {
    it('restores the saved sources and always offers the fallback', async () => {
      await renderLive();
      const app = screen.getByLabelText<HTMLSelectElement>('Meeting app');
      expect(app.value).toBe('app-teams');
      expect(within(app).getByText('Whole computer audio')).toBeTruthy();
      expect(screen.getByLabelText<HTMLSelectElement>('Microphone').value).toBe('');
    });

    it('offers the fallback when the chosen app is not running', async () => {
      await renderLive();
      const app = screen.getByLabelText<HTMLSelectElement>('Meeting app');
      fireEvent.change(app, { target: { value: 'app-zoom' } });
      await advance(0);
      fireEvent.click(button('Use Whole computer audio'));
      await advance(0);
      expect(app.value).toBe('whole-computer');
      expect((await backend.call('getSettings')).audio.meetingAppId).toBe('whole-computer');
    });

    it('warns that browser capture takes every tab', async () => {
      await renderLive();
      fireEvent.change(screen.getByLabelText('Meeting app'), { target: { value: 'app-browser' } });
      await advance(0);
      expect(screen.getByText(/including other tabs/)).toBeTruthy();
    });

    it('offers a new device, then switches to it', async () => {
      await startMeeting();
      await trigger('device-changed');
      fireEvent.click(button('Use USB Conference Headset'));
      await advance(0);
      expect(screen.getByLabelText<HTMLSelectElement>('Microphone').value).toBe('mic-usb');
      expect(screen.queryByText(/was connected/)).toBeNull();
    });

    it('says which device took over from a removed one', async () => {
      await startMeeting();
      await trigger('mic-removed');
      expect(screen.getByText(/Now using Built-in Microphone/)).toBeTruthy();
    });
  });

  it('writes levels without re-rendering', async () => {
    await startMeeting();
    const [mic] = screen.getAllByRole('meter');
    act(() => backend.emit('levelMeter', { micDb: -30, meetingDb: -12 }));
    expect((mic as HTMLElement).style.getPropertyValue('--level')).toBe('0.5');
    expect(mic?.getAttribute('aria-valuenow')).toBe('-30');
  });

  describe('warnings', () => {
    it.each([
      ['mic-silent', 'Mic silent'],
      ['low-disk', 'Low disk'],
      ['permission-lost', 'Permission lost'],
      ['audio-missing', 'Audio missing'],
    ])('shows %s', async (id, title) => {
      await startMeeting();
      await trigger(id);
      expect(screen.getByRole('alert').textContent).toContain(title);
      expect(screen.getByTestId('recording-health').textContent).toContain('needs attention');
    });

    it('keeps a transcription failure apart from recording health', async () => {
      await startMeeting();
      await trigger('transcription-failed');
      expect(screen.getByTestId('recording-health').textContent).toBe('Recording: healthy');
      expect(screen.getByTestId('transcript-lag').textContent).toBe('Transcript: stopped');
      expect(screen.getByRole('alert').textContent).toContain('still running');
    });

    it('shows how far behind transcription is', async () => {
      await startMeeting();
      await trigger('lagging');
      expect(screen.getByTestId('transcript-lag').textContent).toBe('Transcript: 14 s behind');
    });

    it('shows the privacy banner until dismissed, and again at the next recording', async () => {
      await backend.call('updateSettings', { location: { usState: 'IL' } });
      await startMeeting();
      expect(screen.getByText(/Voice profiles are being built/)).toBeTruthy();
      fireEvent.click(button('Dismiss'));
      expect(screen.queryByText(/Voice profiles are being built/)).toBeNull();

      fireEvent.click(button('Stop'));
      await advance(0);
      fireEvent.click(button('Start'));
      await advance(0);
      expect(screen.getByText(/Voice profiles are being built/)).toBeTruthy();
    });
  });

  describe('transcript', () => {
    it('styles provisional and final text differently', async () => {
      await startMeeting(8);
      const states = new Set(words().map((word) => word.dataset['state']));
      expect(states).toEqual(new Set(['provisional', 'final']));
    });

    it('renders a small window of an 8-hour transcript and keeps it live', async () => {
      await renderLive();
      await trigger('start-8-hours');
      await advance(2000);
      expect(document.querySelectorAll('[data-segment-id]').length).toBeLessThan(40);
      expect(words().length).toBeGreaterThan(0);
      const page = await backend.call('getTranscript', {
        meetingId: (await backend.call('getRecordingSnapshot')).state.meetingId as string,
        offset: 0,
        limit: 1,
      });
      expect(page.totalWords).toBeGreaterThanOrEqual(80_000);
      const tail = page.totalSegments - 1;
      expect(document.querySelector(`[data-segment-id$="-seg-${tail}"]`)).toBeTruthy();
    });

    it('plays the matching audio on click, and stops it', async () => {
      await startMeeting();
      const seek = vi.spyOn(backend, 'call');
      const word = words()[3] as HTMLElement;
      clickWord(word);
      await advance(300);
      expect(seek).toHaveBeenCalledWith(
        'seekAudio',
        expect.objectContaining({ positionMs: expect.any(Number) as number }),
      );
      expect(screen.getByText(/^Playing/)).toBeTruthy();
      fireEvent.click(button('Stop audio'));
      await advance(0);
      expect(screen.queryByText(/^Playing/)).toBeNull();
    });

    it('does not play on a double-click, which selects the word instead', async () => {
      await startMeeting();
      const seek = vi.spyOn(backend, 'call');
      const word = words()[2] as HTMLElement;
      clickWord(word);
      fireEvent.mouseDown(word, { detail: 2 });
      fireEvent.mouseUp(word, { detail: 2 });
      fireEvent.doubleClick(word, { detail: 2 });
      await advance(300);
      expect(seek).not.toHaveBeenCalledWith('seekAudio', expect.anything());
      expect(selected()).toEqual([word.textContent]);
      expect(screen.getByRole('form', { name: 'Correct transcript' })).toBeTruthy();
    });

    it('pauses auto-scroll on a selection and offers Jump to Live', async () => {
      await startMeeting();
      expect(screen.queryByRole('button', { name: 'Jump to Live' })).toBeNull();
      dragAcross(words()[0] as HTMLElement, words()[1] as HTMLElement);
      expect(transcript().dataset['following']).toBe('false');
      fireEvent.click(button('Jump to Live'));
      await advance(0);
      expect(transcript().dataset['following']).toBe('true');
      expect(selected()).toEqual([]);
    });

    it('keeps a selection and its draft through 60 seconds of incoming text', async () => {
      await startMeeting();
      const [first, second] = words() as [HTMLElement, HTMLElement];
      const expected = [first.textContent, second.textContent];
      dragAcross(first, second);
      const input = screen.getByLabelText<HTMLInputElement>('Correct text');
      fireEvent.change(input, { target: { value: 'typed while recording' } });

      await advance(60_000);

      expect(selected()).toEqual(expected);
      expect(input.isConnected).toBe(true);
      expect(input.value).toBe('typed while recording');
    });

    it('applies a correction, then undoes and redoes it', async () => {
      await startMeeting();
      dragAcross(words()[0] as HTMLElement, words()[1] as HTMLElement);
      fireEvent.change(screen.getByLabelText('Correct text'), {
        target: { value: 'Halden Depot' },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Remember correction' }));
      fireEvent.click(button('Apply'));
      await advance(0);

      expect(words()[0]?.textContent).toBe('Halden');
      expect(words()[0]?.dataset['state']).toBe('corrected');
      expect((await backend.call('listTerms')).at(-1)?.term).toBe('Halden Depot');

      fireEvent.click(button('Undo'));
      await advance(0);
      expect(words()[0]?.dataset['state']).not.toBe('corrected');
      expect(button('Undo')).toHaveProperty('disabled', true);

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
      await advance(0);
      expect(words()[0]?.textContent).toBe('Halden');
    });

    it('keeps the editor open and shows the reason when a correction fails', async () => {
      await startMeeting();
      dragAcross(words()[0] as HTMLElement, words()[1] as HTMLElement);
      const call = backend.call;
      backend.call = vi.fn().mockRejectedValue(new Error('That text is frozen.'));
      fireEvent.change(screen.getByLabelText('Correct text'), { target: { value: 'x' } });
      fireEvent.click(button('Apply'));
      await advance(0);
      backend.call = call;
      expect(screen.getByRole('alert').textContent).toBe('That text is frozen.');
      expect(screen.getByLabelText<HTMLInputElement>('Correct text').value).toBe('x');
    });

    it('selects and corrects by keyboard alone', async () => {
      await startMeeting();
      transcript().focus();
      fireEvent.keyDown(transcript(), { key: 'Home' });
      fireEvent.keyDown(transcript(), { key: 'ArrowRight', shiftKey: true });
      expect(selected().length).toBe(2);

      fireEvent.keyDown(transcript(), { key: 'Enter' });
      const input = screen.getByLabelText<HTMLInputElement>('Correct text');
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('form', { name: 'Correct transcript' })).toBeNull();
      expect(document.activeElement).toBe(transcript());
      expect(selected().length).toBe(2);
    });

    it('plays from the cursor with Space', async () => {
      await startMeeting();
      fireEvent.keyDown(transcript(), { key: 'ArrowRight' });
      fireEvent.keyDown(transcript(), { key: ' ' });
      await advance(0);
      expect(screen.getByText(/^Playing/)).toBeTruthy();
    });

    it('resizes the text and saves the size', async () => {
      await startMeeting();
      fireEvent.click(button('Larger transcript text'));
      await advance(0);
      expect((await backend.call('getSettings')).transcriptFontPx).toBe(16);
    });

    it('applies a realigned or replaced segment without losing the selection', async () => {
      await startMeeting();
      const word = words()[0] as HTMLElement;
      const { state } = await backend.call('getRecordingSnapshot');
      const meetingId = state.meetingId as string;
      const page = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
      const segment = page.segments[0] as TranscriptSegment;
      fireEvent.doubleClick(word);

      act(() =>
        backend.emit('transcriptChanged', {
          meetingId,
          revision: page.revision + 1,
          change: {
            kind: 'replace',
            segments: [{ ...segment, id: 'rewritten' }],
            removedSegmentIds: [segment.id],
          },
          speakers: [],
        }),
      );
      await advance(0);

      expect(selected()).toEqual([word.textContent]);
    });
  });
});
