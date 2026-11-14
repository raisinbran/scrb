import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContractError, isValidRequest, type TranscriptSegment } from '@scrb/contracts';
import { PrivacyBanner } from '../components/PrivacyBanner.tsx';
import { BackendProvider } from '../lib/backend-context.tsx';
import { createHybridBackend } from '../lib/hybrid-backend.ts';
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
      <PrivacyBanner />
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

    it('keeps the pickers enabled while recording and applies a change', async () => {
      await startMeeting();
      const mic = screen.getByLabelText<HTMLSelectElement>('Microphone');
      expect(mic.disabled).toBe(false);
      fireEvent.change(mic, { target: { value: 'mic-usb' } });
      expect(mic.disabled).toBe(true);
      expect(screen.getByText('Switching…')).toBeTruthy();
      await advance(0);
      expect(mic.disabled).toBe(false);
      expect(mic.value).toBe('mic-usb');
      expect((await backend.call('getSettings')).audio.micDeviceId).toBe('mic-usb');
    });

    it('reverts the picker and shows the reason when the switch is refused', async () => {
      await startMeeting();
      const app = screen.getByLabelText<HTMLSelectElement>('Meeting app');
      fireEvent.change(app, { target: { value: 'app-zoom' } });
      await advance(0);
      expect(screen.getByText(/not playing audio yet/)).toBeTruthy();
      expect(app.value).toBe('app-teams');
      expect(app.disabled).toBe(false);
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

  describe('after Stop', () => {
    const notice = () => screen.getByText(/^Recording stopped\./).textContent;

    it('follows the final pass instead of claiming it still runs', async () => {
      await startMeeting();
      fireEvent.click(button('Stop'));
      await advance(0);
      expect(notice()).toContain('final pass is running');
      await trigger('finish-final-pass');
      // A final transcript needs no notice, and the old "ready" message is gone for good.
      expect(screen.queryByText(/^Recording stopped\./)).toBeNull();
      expect(screen.queryByText(/final transcript is ready/)).toBeNull();
    });

    it('can be dismissed with an X', async () => {
      await startMeeting();
      fireEvent.click(button('Stop'));
      await advance(0);
      expect(notice()).toContain('final pass is running');
      fireEvent.click(button('Dismiss notice'));
      expect(screen.queryByText(/^Recording stopped\./)).toBeNull();
    });

    it('says when the transcript could not be finished', async () => {
      await startMeeting();
      const meetingId = (await backend.call('getRecordingSnapshot')).state.meetingId as string;
      fireEvent.click(button('Stop'));
      await advance(0);
      const item = (await backend.call('listMeetings', {})).find((m) => m.id === meetingId);
      act(() =>
        backend.emit('meetingChanged', {
          ...(item as NonNullable<typeof item>),
          status: 'transcriptionFailed',
        }),
      );
      expect(notice()).toContain('audio is saved');
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
    it('shows real live and failed transcript states', async () => {
      const real = new MockBackend();
      try {
        render(
          <BackendProvider backend={createHybridBackend(real, backend)}>
            <LiveScreen />
          </BackendProvider>,
        );
        await advance(0);
        fireEvent.click(button('Start'));
        await advance(0);
        expect(button('Pause')).toBeTruthy();

        act(() => real.emit('transcriptionLag', { status: 'ok', lagMs: 0 }));
        expect(screen.getByTestId('transcript-lag').textContent).toBe('Transcript: live');

        act(() => real.emit('transcriptionLag', { status: 'failed', lagMs: 0 }));
        expect(screen.getByTestId('transcript-lag').textContent).toBe('Transcript: stopped');
        expect(screen.getByTestId('recording-health').textContent).toBe('Recording: healthy');
      } finally {
        real.dispose();
      }
    });

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
      expect(screen.getByRole('alert').textContent).toContain('not affected');
    });

    it('shows how far behind transcription is', async () => {
      await startMeeting();
      await trigger('lagging');
      expect(screen.getByTestId('transcript-lag').textContent).toBe('Transcript: 14 s behind');
    });

    it('says transcription is catching up when the delay is under a second', async () => {
      await startMeeting();
      act(() => backend.emit('transcriptionLag', { status: 'lagging', lagMs: 0 }));
      expect(screen.getByTestId('transcript-lag').textContent).toBe('Transcript: catching up');
    });

    it('shows the privacy banner until dismissed, and again at the next recording', async () => {
      await backend.call('updateSettings', { location: { usState: 'IL' } });
      await startMeeting();
      expect(screen.getAllByText(/Voice profiles are being built/)).toHaveLength(1);
      fireEvent.click(button(/^Dismiss/));
      expect(screen.queryByText(/Voice profiles are being built/)).toBeNull();

      fireEvent.click(button('Stop'));
      await advance(0);
      fireEvent.click(button('Start'));
      await advance(0);
      expect(screen.getByText(/Voice profiles are being built/)).toBeTruthy();
    });
  });

  describe('transcript', () => {
    it('renders real transcript events in Live', async () => {
      const real = new MockBackend();
      try {
        render(
          <BackendProvider backend={createHybridBackend(real, backend)}>
            <LiveScreen />
          </BackendProvider>,
        );
        await advance(0);
        fireEvent.click(button('Start'));
        await advance(1000);

        const meetingId = (await real.call('getRecordingSnapshot')).state.meetingId as string;
        const page = await real.call('getTranscript', { meetingId, offset: 0, limit: 1 });
        const original = page.segments[0] as TranscriptSegment;
        const startMs = original.endMs + 1;
        const endMs = startMs + 100;
        expect(words().some((word) => word.textContent === 'routedword')).toBe(false);

        act(() =>
          real.emit('transcriptChanged', {
            meetingId,
            revision: page.revision + 1,
            change: {
              kind: 'append',
              segments: [
                {
                  ...original,
                  id: 'real-routed-segment',
                  startMs,
                  endMs,
                  words: [
                    {
                      ...original.words[0]!,
                      id: 'real-routed-word',
                      text: 'routedword',
                      startMs,
                      endMs,
                    },
                  ],
                },
              ],
            },
            speakers: [],
          }),
        );
        await advance(0);

        expect(words().some((word) => word.textContent === 'routedword')).toBe(true);
      } finally {
        real.dispose();
      }
    });
    it('offsets each row slot, so no slot lies over the rows above it', async () => {
      await startMeeting(3);
      const slots = [...document.querySelectorAll<HTMLElement>('[data-row-index]')];
      expect(slots.length).toBeGreaterThan(1);
      expect(slots.every((slot) => slot.style.transform.startsWith('translateY('))).toBe(true);
    });

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

    it('keeps a mouse selection and the scroll position through 60 seconds of text', async () => {
      await startMeeting();
      const [first, second] = words() as [HTMLElement, HTMLElement];
      const expected = [first.textContent, second.textContent];
      dragAcross(first, second);
      const view = transcript();
      view.scrollTop = 40;

      await advance(60_000);

      expect(selected()).toEqual(expected);
      expect(view.scrollTop).toBe(40);
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
      // Closing the editor ends the selection, so no highlight is left behind.
      expect(selected().length).toBe(0);
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

    it('stays on the text being read when a row above it goes away', async () => {
      await renderLive();
      await trigger('start-8-hours');
      await advance(2000);
      const element = transcript();
      Object.defineProperty(element, 'scrollHeight', { value: 10_000_000 });
      fireEvent.scroll(element);
      element.scrollTop = 200_000;
      fireEvent.scroll(element);
      await advance(1000);
      const id = document.querySelectorAll('[data-segment-id]')[8]?.getAttribute('data-segment-id');
      const screenTop = () => {
        const row = document.querySelector(`[data-segment-id="${id}"]`);
        const slot = row?.parentElement as HTMLElement;
        return Number(/translateY\((.+)px\)/.exec(slot.style.transform)?.[1]) - element.scrollTop;
      };
      const before = screenTop();

      const meetingId = (await backend.call('getRecordingSnapshot')).state.meetingId as string;
      const { revision } = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
      const above = document.querySelector('[data-segment-id]')?.getAttribute('data-segment-id');
      act(() =>
        backend.emit('transcriptChanged', {
          meetingId,
          revision: revision + 1,
          change: { kind: 'replace', segments: [], removedSegmentIds: [above as string] },
          speakers: [],
        }),
      );
      await advance(0);

      expect(screenTop()).toBeCloseTo(before, 0);
      expect(element.dataset['following']).toBe('false');
    });

    it('keeps following off while a selection is open, even near the end', async () => {
      await startMeeting();
      fireEvent.doubleClick(words().at(-1) as HTMLElement);
      fireEvent.scroll(transcript());
      fireEvent.scroll(transcript());
      await advance(0);
      expect(transcript().dataset['following']).toBe('false');
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
    describe('selection, cursor and menu', () => {
      const rewriteFirstSegment = async (retime: boolean) => {
        const { state } = await backend.call('getRecordingSnapshot');
        const meetingId = state.meetingId as string;
        const page = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
        const segment = page.segments[0] as TranscriptSegment;
        const rewritten = {
          ...segment,
          words: segment.words.map((word) => ({
            ...word,
            id: `${word.id}-v2`,
            startMs: word.startMs + (retime ? 7 : 0),
            endMs: word.endMs + (retime ? 7 : 0),
          })),
        };
        act(() =>
          backend.emit('transcriptChanged', {
            meetingId,
            revision: page.revision + 1,
            change: { kind: 'replace', segments: [rewritten], removedSegmentIds: [] },
            speakers: [],
          }),
        );
        await advance(0);
        return { meetingId, rewritten };
      };

      it('applies a correction after the live pass re-timed the word being edited', async () => {
        await startMeeting();
        fireEvent.doubleClick(words()[1] as HTMLElement);
        const { rewritten } = await rewriteFirstSegment(true);
        const call = vi.spyOn(backend, 'call');
        fireEvent.change(screen.getByLabelText('Correct text'), { target: { value: 'fixed' } });
        fireEvent.click(button('Apply'));
        await advance(0);
        const sent = call.mock.calls.find(([name]) => name === 'applyCorrection')?.[1] as {
          range: { firstWordId: string };
        };
        expect(sent.range.firstWordId).toBe(rewritten.words[1]?.id);
      });

      it('retries once with the current ids when the backend reports a conflict', async () => {
        await startMeeting();
        fireEvent.doubleClick(words()[0] as HTMLElement);
        const real = backend.call.bind(backend) as (name: string, request?: unknown) => unknown;
        let tries = 0;
        vi.spyOn(backend, 'call').mockImplementation(((name: string, request?: unknown) => {
          if (name === 'applyCorrection' && tries++ === 0) {
            return Promise.reject(new ContractError({ code: 'conflict', message: 'stale' }));
          }
          return real(name, request);
        }) as never);
        fireEvent.change(screen.getByLabelText('Correct text'), { target: { value: 'fixed' } });
        fireEvent.click(button('Apply'));
        await advance(10);
        expect(tries).toBe(2);
        expect(screen.queryByRole('form', { name: 'Correct transcript' })).toBeNull();
        expect(words()[0]?.textContent).toBe('fixed');
      });

      it('clears the selection when the editor is cancelled or the user clicks away', async () => {
        await startMeeting();
        fireEvent.doubleClick(words()[0] as HTMLElement);
        expect(selected().length).toBe(1);
        expect(document.querySelectorAll('[data-cursor]').length).toBe(1);
        fireEvent.click(button('Cancel'));
        expect(selected().length).toBe(0);
        // The purple outline around the word goes too.
        expect(document.querySelectorAll('[data-cursor]').length).toBe(0);

        fireEvent.doubleClick(words()[0] as HTMLElement);
        expect(selected().length).toBe(1);
        fireEvent.pointerDown(button('Undo'));
        expect(selected().length).toBe(0);
        expect(document.querySelectorAll('[data-cursor]').length).toBe(0);
        expect(screen.queryByRole('form', { name: 'Correct transcript' })).toBeNull();

        fireEvent.doubleClick(words()[0] as HTMLElement);
        fireEvent.mouseDown(transcript().firstElementChild as HTMLElement);
        expect(selected().length).toBe(0);
      });

      it('keeps the pointer an arrow except over words', () => {
        const css = readFileSync(join(__dirname, 'live/TranscriptView.module.css'), 'utf8');
        expect(/\.canvas \{[^}]*cursor: default/.test(css)).toBe(true);
        expect(/\.word \{[^}]*cursor: text/.test(css)).toBe(true);
      });

      it('offers Copy and Correct text on a selection and copies it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        await startMeeting();
        dragAcross(words()[0] as HTMLElement, words()[1] as HTMLElement);
        fireEvent.keyDown(screen.getByLabelText<HTMLInputElement>('Correct text'), {
          key: 'Escape',
        });
        dragAcross(words()[0] as HTMLElement, words()[1] as HTMLElement);
        fireEvent.keyDown(screen.getByLabelText<HTMLInputElement>('Correct text'), {
          key: 'Escape',
        });
        fireEvent.contextMenu(words()[0] as HTMLElement);
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
          'Copy',
          'Correct text',
        ]);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
        expect(writeText).toHaveBeenCalledWith(words()[0]?.textContent);
      });

      it('opens the correction editor from the menu', async () => {
        await startMeeting();
        fireEvent.contextMenu(words()[2] as HTMLElement);
        expect(selected()).toEqual([words()[2]?.textContent]);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Correct text' }));
        expect(screen.getByLabelText<HTMLInputElement>('Correct text').value).toBe(
          words()[2]?.textContent,
        );
      });

      it('clicks a word with fractional live timings using requests the real validator accepts', async () => {
        await startMeeting();
        const { meetingId, rewritten } = await rewriteFirstSegment(false);
        const fractional = {
          ...rewritten,
          words: rewritten.words.map((word, index) => ({
            ...word,
            id: `${word.id}-f`,
            startMs: 1000.4 + index * 100.25,
            endMs: 1050.6 + index * 100.25,
          })),
        };
        const { revision } = await backend.call('getTranscript', {
          meetingId,
          offset: 0,
          limit: 1,
        });
        act(() =>
          backend.emit('transcriptChanged', {
            meetingId,
            revision: revision + 1,
            change: { kind: 'replace', segments: [fractional], removedSegmentIds: [] },
            speakers: [],
          }),
        );
        await advance(0);
        const requests: unknown[] = [];
        const real = backend.call.bind(backend) as (name: string, request?: unknown) => unknown;
        vi.spyOn(backend, 'call').mockImplementation(((name: string, request?: unknown) => {
          if (name === 'seekAudio' || name === 'getPlaybackMedia') {
            requests.push([name, request]);
            expect(isValidRequest(name, request)).toBe(true);
          }
          return real(name, request);
        }) as never);
        clickWord(words()[1] as HTMLElement);
        await advance(300);
        expect(requests.length).toBeGreaterThan(0);
      });

      it('shows a playback notice that can be dismissed and clears on the next success', async () => {
        await startMeeting();
        const real = backend.call.bind(backend) as (name: string, request?: unknown) => unknown;
        let fail = true;
        vi.spyOn(backend, 'call').mockImplementation(((name: string, request?: unknown) =>
          name === 'seekAudio' && fail
            ? Promise.reject(new ContractError({ code: 'invalidRequest', message: 'Nope.' }))
            : real(name, request)) as never);
        clickWord(words()[0] as HTMLElement);
        await advance(300);
        expect(screen.getByRole('alert').textContent).toContain('Nope.');
        fireEvent.click(button('Dismiss'));
        expect(screen.queryByRole('alert')).toBeNull();

        clickWord(words()[0] as HTMLElement);
        await advance(300);
        expect(screen.getByRole('alert')).toBeTruthy();
        fail = false;
        clickWord(words()[1] as HTMLElement);
        await advance(300);
        expect(screen.queryByRole('alert')).toBeNull();
      });

      it('still seeks on a click and selects on a drag', async () => {
        await startMeeting();
        clickWord(words()[0] as HTMLElement);
        await advance(300);
        expect(screen.getByText(/^Playing/)).toBeTruthy();
        expect(selected().length).toBe(0);
        dragAcross(words()[0] as HTMLElement, words()[2] as HTMLElement);
        expect(selected().length).toBe(3);
      });
    });
  });
});
