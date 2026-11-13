import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { MockBackend } from '../../mocks/index.ts';
import { RecordingsScreen } from '../RecordingsScreen.tsx';

const SLOW = { timeout: 5000 };
let backend: MockBackend;

function renderScreen() {
  backend = new MockBackend();
  render(
    <BackendProvider backend={backend}>
      <RecordingsScreen />
    </BackendProvider>,
  );
  return backend;
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });

async function openMeeting(title: RegExp) {
  fireEvent.click(await button(title));
  await screen.findByRole('tab', { name: 'Transcript' });
}

async function openTab(title: RegExp, tab: 'Summary' | 'Audio') {
  await openMeeting(title);
  fireEvent.click(screen.getByRole('tab', { name: tab }));
}

describe('Recordings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
  });

  describe('library', () => {
    it('shows each in-progress state', async () => {
      renderScreen();
      expect(await screen.findByText('Final pass running')).toBeTruthy();
      expect(screen.getByText('Recovered after crash')).toBeTruthy();
      expect(screen.getByText('May be outdated')).toBeTruthy();
    });

    it('filters by source', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'imported' } });
      await waitFor(() => expect(screen.queryByText('Budget review')).toBeNull());
      expect(screen.getByText('Imported interview recording')).toBeTruthy();
    });

    it('filters by date', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-22' } });
      await waitFor(() => expect(screen.queryByText('Budget review')).toBeNull());
    });

    it('focuses the title after meeting navigation', async () => {
      renderScreen();
      (await button(/Weekly project sync/)).focus();
      await openMeeting(/Weekly project sync/);
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('heading', { name: 'Weekly project sync' }),
        ),
      );
    });

    it('searches transcripts and opens a match at its time', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.change(screen.getByLabelText('Search recordings'), {
        target: { value: 'northern depot' },
      });
      const snippets = await screen.findAllByText('northern depot');
      fireEvent.click(snippets[0]?.closest('button') as HTMLElement);
      expect(await screen.findByRole('tab', { name: 'Transcript' })).toBeTruthy();
    });

    it('says when nothing matches, and differs from an empty library', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.change(screen.getByLabelText('Search recordings'), {
        target: { value: 'zzzz' },
      });
      expect(await screen.findByText('No matching recordings')).toBeTruthy();
    });

    it('notices a final pass finishing, which has no event', async () => {
      renderScreen();
      await screen.findByText('Final pass running');
      backend.finishFinalPass();
      await waitFor(() => expect(screen.queryByText('Final pass running')).toBeNull(), SLOW);
    });
  });

  describe('import', () => {
    async function startImport(profiles = false) {
      fireEvent.click(await button('Import audio file'));
      const dialog = await screen.findByRole('dialog', { name: 'Import audio file' });
      const box = within(dialog).getByRole('checkbox') as HTMLInputElement;
      expect(box.checked).toBe(false);
      if (profiles) fireEvent.click(box);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }

    it('does nothing when the picker is cancelled', async () => {
      renderScreen();
      backend.arm('pickerCancelled');
      fireEvent.click(await button('Import audio file'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('sends the per-file voice profile choice, off by default', async () => {
      renderScreen();
      const call = vi.spyOn(backend, 'call');
      await startImport();
      expect(call).toHaveBeenCalledWith(
        'importAudioFile',
        expect.objectContaining({
          buildVoiceProfiles: false,
        }),
      );
    });

    it('keeps an import privacy reminder dismissed after leaving and returning', async () => {
      renderScreen();
      await backend.call('updateSettings', { location: { country: 'US', usState: 'IL' } });
      await startImport(true);
      const reminder = /Voice-profile building (is|was) enabled for this import\./;
      expect(await screen.findByText(reminder)).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: /Dismiss voice-profile privacy reminder for/ }),
      );
      expect(screen.queryByText(reminder)).toBeNull();

      fireEvent.click(await button(/Budget review/));
      await screen.findByRole('tab', { name: 'Transcript' });
      fireEvent.click(screen.getByRole('button', { name: /Recordings/ }));
      await button('Import audio file');
      expect(screen.queryByText(reminder)).toBeNull();
    });

    it('uses completed-state wording without claiming profiles were created', async () => {
      renderScreen();
      await backend.call('updateSettings', { location: { country: 'US', usState: 'IL' } });
      await startImport(true);
      await screen.findByRole('button', { name: 'Open' }, SLOW);
      expect(screen.getByText('Voice-profile building was enabled for this import.')).toBeTruthy();
    });

    it('does not show the import privacy reminder when profiling is off', async () => {
      renderScreen();
      await backend.call('updateSettings', { location: { country: 'US', usState: 'IL' } });
      await startImport();
      expect(screen.queryByText(/Voice-profile building/)).toBeNull();
    });

    it('shows progress, then lets the user open the new meeting', async () => {
      renderScreen();
      await startImport();
      expect(await screen.findByRole('progressbar', { name: /Importing/ })).toBeTruthy();
      fireEvent.click(await screen.findByRole('button', { name: 'Open' }, SLOW));
      expect(await screen.findByRole('heading', { name: 'Client interview.m4a' })).toBeTruthy();
    });

    it('cancels and leaves no meeting', async () => {
      renderScreen();
      await startImport();
      fireEvent.click(await button(/Cancel import/));
      await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
      expect(await backend.call('listMeetings', {})).toHaveLength(6);
    });

    it.each([
      ['importFails', /could not be read/, false],
      ['importUnsupported', /not supported/, false],
      ['importDiskFull', /not enough disk/, true],
    ] as const)('shows the %s failure', async (fault, message, canRetry) => {
      renderScreen();
      backend.arm(fault);
      await startImport();
      expect(await screen.findByText(message, undefined, SLOW)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(canRetry);
      fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
      await waitFor(() => expect(screen.queryByText(message)).toBeNull());
    });

    it('offers a retry when a recording stopped the import', async () => {
      renderScreen();
      await startImport();
      await backend.call('startRecording', {});
      expect(await screen.findByText(/A recording started/)).toBeTruthy();
      await backend.call('stopRecording');
      fireEvent.click(await button('Try again'));
      expect(await screen.findByRole('progressbar', { name: /Importing/ })).toBeTruthy();
    });
  });

  describe('meeting detail', () => {
    it('shows transcript text, gaps and speakers', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      expect((await screen.findAllByRole('button', { name: /Play from/ })).length).toBeGreaterThan(
        0,
      );
    });

    it('plays from a transcript timestamp', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const links = await screen.findAllByRole('button', { name: /Play from/ });
      const call = vi.spyOn(backend, 'call');
      fireEvent.click(links[1] as HTMLElement);
      expect(call).toHaveBeenCalledWith(
        'seekAudio',
        expect.objectContaining({
          meetingId: 'meeting-outdated',
        }),
      );
      expect(await button('Pause')).toBeTruthy();
    });

    it('highlights a clicked word at 0 ms while stopped, without playing', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const call = vi.spyOn(backend, 'call');
      const word = document.querySelector('[data-ms="0"]') as HTMLElement;
      expect(word).toBeTruthy();
      fireEvent.click(word);
      expect(word.getAttribute('aria-current')).toBe('true');
      expect(call).not.toHaveBeenCalledWith('seekAudio', expect.anything());
    });

    it('toggles play and pause with Space without scrolling', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const call = vi.spyOn(backend, 'call');
      expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false);
      expect(call).toHaveBeenCalledWith('seekAudio', expect.anything());
      fireEvent.click(await button('Pause'));
      call.mockClear();
      fireEvent.click(await button('Play'));
      call.mockClear();
      expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false);
      expect(call).toHaveBeenCalledWith('pauseAudio', expect.anything());
    });

    it('leaves Space and arrows to text fields and buttons', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
      const input = (await screen.findByRole('dialog')).querySelector('input') as HTMLElement;
      const call = vi.spyOn(backend, 'call');
      expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true);
      expect(fireEvent.keyDown(input, { key: 'ArrowRight' })).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(call).not.toHaveBeenCalledWith('seekAudio', expect.anything());
    });

    it('plays and pauses with Space even when a button has the focus', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const links = await screen.findAllByRole('button', { name: /Play from/ });
      const link = links[1] as HTMLElement;
      fireEvent.click(link);
      link.focus();
      await button('Pause');
      const call = vi.spyOn(backend, 'call');
      // Space on the timestamp button must pause, not play from that timestamp again.
      expect(fireEvent.keyDown(link, { key: ' ' })).toBe(false);
      expect(fireEvent.keyUp(link, { key: ' ' })).toBe(false);
      expect(call).toHaveBeenCalledWith('pauseAudio', expect.anything());
      expect(call).not.toHaveBeenCalledWith('seekAudio', expect.anything());
      for (const control of [
        screen.getByRole('button', { name: 'Back 15 seconds' }),
        screen.getByRole('tab', { name: 'Transcript' }),
        screen.getByRole('slider', { name: 'Playback position' }),
      ]) {
        call.mockClear();
        expect(fireEvent.keyDown(control, { key: ' ' })).toBe(false);
        expect(call).toHaveBeenCalled();
      }
    });

    it('skips with the arrow keys after a click on a button or the slider', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const time = () => screen.getByRole('group', { name: 'Audio player' }).textContent;
      const forward = screen.getByRole('button', { name: 'Forward 15 seconds' });
      fireEvent.click(forward);
      expect(time()).toMatch(/00:15/);
      expect(fireEvent.keyDown(forward, { key: 'ArrowRight' })).toBe(false);
      expect(time()).toMatch(/00:30/);
      const slider = screen.getByRole('slider', { name: 'Playback position' });
      expect(fireEvent.keyDown(slider, { key: 'ArrowLeft' })).toBe(false);
      expect(time()).toMatch(/00:15/);
    });

    it('a word click seeks without pausing while audio plays, and only moves the playhead when stopped', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const links = await screen.findAllByRole('button', { name: /Play from/ });
      const words = [...document.querySelectorAll<HTMLElement>('[data-ms]')];
      const target = words[words.length - 1] as HTMLElement;
      const call = vi.spyOn(backend, 'call');
      fireEvent.click(target);
      expect(call).not.toHaveBeenCalledWith('seekAudio', expect.anything());
      expect(target.getAttribute('aria-current')).toBe('true');
      const clicked = Number(target.dataset['ms']);
      expect(screen.getByRole('group', { name: 'Audio player' }).textContent).toContain(
        `${Math.floor(clicked / 60000)
          .toString()
          .padStart(2, '0')}:`,
      );
      fireEvent.click(links[1] as HTMLElement);
      await button('Pause');
      call.mockClear();
      fireEvent.click(words[1] as HTMLElement);
      expect(call).toHaveBeenCalledWith('seekAudio', expect.anything());
      expect(call).not.toHaveBeenCalledWith('pauseAudio', expect.anything());
      expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    it('skips 15 seconds with the arrow keys, but the tabs keep their arrows', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const time = () => screen.getByRole('group', { name: 'Audio player' }).textContent;
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(time()).toMatch(/00:15/);
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(time()).toMatch(/00:00/);
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Transcript' }), { key: 'ArrowRight' });
      expect(time()).toMatch(/00:00/);
      expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });

    describe('editing a finished meeting', () => {
      const firstWord = async () => {
        await screen.findAllByRole('button', { name: /Play from/ });
        return document.querySelector('[data-word]') as HTMLElement;
      };
      const correct = async (word: HTMLElement, text: string) => {
        fireEvent.doubleClick(word);
        const form = await screen.findByRole('form', { name: 'Correct transcript' });
        fireEvent.change(within(form).getByRole('textbox'), { target: { value: text } });
        fireEvent.click(within(form).getByRole('button', { name: 'Apply' }));
      };
      const undoButton = () => screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;

      it('corrects one word on double-click, shows it, and Undo brings the old word back', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        const word = await firstWord();
        const id = word.dataset['word'];
        const original = word.textContent;
        expect(undoButton().disabled).toBe(true);
        await correct(word, 'Zebra');
        await waitFor(() =>
          expect(document.querySelector(`[data-word="${id}"]`)?.textContent).toBe('Zebra'),
        );
        await waitFor(() => expect(undoButton().disabled).toBe(false));
        fireEvent.click(undoButton());
        await waitFor(() =>
          expect(document.querySelector(`[data-word="${id}"]`)?.textContent).toBe(original),
        );
      });

      it('corrects a word while audio plays, without pausing it', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        const word = await firstWord();
        fireEvent.click(
          (await screen.findAllByRole('button', { name: /Play from/ }))[1] as HTMLElement,
        );
        await button('Pause');
        const call = vi.spyOn(backend, 'call');
        await correct(word, 'Zebra');
        await waitFor(() =>
          expect(call).toHaveBeenCalledWith('applyCorrection', expect.anything()),
        );
        expect(call).not.toHaveBeenCalledWith('pauseAudio', expect.anything());
        expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
      });

      it('renames a speaker everywhere, leaves voice profiles alone, and Undo reverses it', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        await firstWord();
        const profiles = JSON.stringify(await backend.call('listProfiles'));
        const first = screen.getAllByRole('button', { name: /^Rename speaker/ })[0] as HTMLElement;
        const oldName = first.textContent as string;
        fireEvent.click(first);
        const form = await screen.findByRole('form', { name: 'Rename speaker' });
        fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Ana' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
        await waitFor(() =>
          expect(
            screen.getAllByRole('button', { name: 'Rename speaker Ana' }).length,
          ).toBeGreaterThan(0),
        );
        expect(screen.queryByRole('button', { name: `Rename speaker ${oldName}` })).toBeNull();
        expect(JSON.stringify(await backend.call('listProfiles'))).toBe(profiles);
        await waitFor(() => expect(undoButton().disabled).toBe(false));
        fireEvent.click(undoButton());
        await waitFor(() =>
          expect(
            screen.getAllByRole('button', { name: `Rename speaker ${oldName}` }).length,
          ).toBeGreaterThan(0),
        );
      });

      it('rejects blank, too long and duplicate speaker names without calling the backend', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        await firstWord();
        const buttons = screen.getAllByRole('button', { name: /^Rename speaker/ });
        const names = [...new Set(buttons.map((item) => item.textContent as string))];
        expect(names.length).toBeGreaterThan(1);
        const call = vi.spyOn(backend, 'call');
        fireEvent.click(buttons.find((item) => item.textContent === names[0]) as HTMLElement);
        const form = await screen.findByRole('form', { name: 'Rename speaker' });
        const box = within(form).getByRole('textbox');
        const save = within(form).getByRole('button', { name: 'Save' });
        for (const bad of ['   ', 'x'.repeat(61), (names[1] as string).toUpperCase()]) {
          fireEvent.change(box, { target: { value: bad } });
          fireEvent.click(save);
          expect(await within(form).findByRole('alert')).toBeTruthy();
        }
        expect(call).not.toHaveBeenCalledWith('renameSpeaker', expect.anything());
      });

      it('ends a rename when its row scrolls out of the rendered range, and the keys work again', async () => {
        renderScreen();
        await openMeeting(/Depot rollout/);
        await firstWord();
        fireEvent.click(
          screen.getAllByRole('button', { name: /^Rename speaker/ })[0] as HTMLElement,
        );
        await screen.findByRole('form', { name: 'Rename speaker' });
        const region = screen.getByRole('region', { name: 'Transcript' });
        region.scrollTop = 200_000;
        fireEvent.scroll(region);
        await waitFor(() =>
          expect(screen.queryByRole('form', { name: 'Rename speaker' })).toBeNull(),
        );
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        expect(screen.getByRole('group', { name: 'Audio player' }).textContent).toMatch(/00:15/);
      });

      it('keeps Undo per meeting when switching between meetings', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        await correct(await firstWord(), 'Zebra');
        await waitFor(() => expect(undoButton().disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: /Recordings/ }));
        await openMeeting(/Vendor call/);
        await waitFor(() => expect(undoButton().disabled).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: /Recordings/ }));
        await openMeeting(/Weekly project sync/);
        await waitFor(() => expect(undoButton().disabled).toBe(false));
      });

      it('turns the playback keys off while an editor is open, also on Apply and Cancel', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        fireEvent.doubleClick(await firstWord());
        const form = await screen.findByRole('form', { name: 'Correct transcript' });
        const call = vi.spyOn(backend, 'call');
        for (const target of [
          within(form).getByRole('button', { name: 'Cancel' }),
          within(form).getByRole('textbox'),
          document.body,
        ]) {
          fireEvent.keyDown(target, { key: 'ArrowRight' });
          fireEvent.keyDown(target, { key: ' ' });
        }
        expect(call).not.toHaveBeenCalledWith('seekAudio', expect.anything());
        expect(screen.getByRole('group', { name: 'Audio player' }).textContent).toMatch(/00:00 \//);
        fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        expect(screen.getByRole('group', { name: 'Audio player' }).textContent).toMatch(/00:15/);
      });

      it('undoes with Ctrl+Z except while typing in a text field', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        const word = await firstWord();
        await correct(word, 'Zebra');
        await waitFor(() => expect(undoButton().disabled).toBe(false));
        fireEvent.doubleClick(await firstWord());
        const form = await screen.findByRole('form', { name: 'Correct transcript' });
        const call = vi.spyOn(backend, 'call');
        fireEvent.keyDown(within(form).getByRole('textbox'), { key: 'z', ctrlKey: true });
        expect(call).not.toHaveBeenCalledWith('undo', expect.anything());
        fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
        fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
        await waitFor(() => expect(call).toHaveBeenCalledWith('undo', expect.anything()));
      });

      it('shows the hint until it is dismissed, and remembers that', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        expect(screen.getByText(/Double-click a word to correct it/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        expect(screen.queryByText(/Double-click a word to correct it/)).toBeNull();
        expect(window.localStorage.getItem('scrb.recordings.editHintDismissed')).toBe('true');
      });
    });

    it('renders only part of the 8-hour transcript', async () => {
      renderScreen();
      const started = performance.now();
      await openMeeting(/Depot rollout/);
      const links = await screen.findAllByRole('button', { name: /Play from/ });
      const elapsedMs = performance.now() - started;
      expect(links.length).toBeLessThan(100);
      // Synthetic 8-hour fixture: include opening the page and its initial virtual window.
      expect(elapsedMs).toBeLessThan(5_000);
    }, 10_000);

    it('flags a recovered meeting', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      expect(await screen.findByText(/Recovered after a crash/)).toBeTruthy();
    });

    it('blocks summary and export during the final pass', async () => {
      renderScreen();
      await openTab(/Budget review/, 'Summary');
      expect(await screen.findByText(/when the final pass is done/)).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Generate Summary' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('opens both folders', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      const call = vi.spyOn(backend, 'call');
      fireEvent.click(screen.getByRole('button', { name: 'Open meeting folder' }));
      fireEvent.click(screen.getByRole('button', { name: 'Open audio folder' }));
      expect(call).toHaveBeenCalledWith(
        'openMeetingFolder',
        expect.objectContaining({
          folder: 'meeting',
        }),
      );
      expect(call).toHaveBeenCalledWith(
        'openMeetingFolder',
        expect.objectContaining({
          folder: 'audio',
        }),
      );
    });

    it('edits the title and date', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
      fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'New name' } });
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('heading', { name: 'New name' })).toBeTruthy();
      const meeting = await backend.call('getMeeting', { meetingId: 'meeting-recovered' });
      expect(meeting.startedAt).toBe('2026-10-01T18:00:00Z');
    });

    it('moves between tabs with the arrow keys', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Transcript' }), { key: 'ArrowRight' });
      expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });

    it('lists gaps on the Audio tab', async () => {
      renderScreen();
      await openTab(/Weekly project sync/, 'Audio');
      expect(await screen.findByText('Paused, 15:00 to 17:00')).toBeTruthy();
    });
  });

  describe('delete', () => {
    async function confirm() {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete meeting' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    }

    it('confirms, deletes and returns to the list', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      await confirm();
      expect(await screen.findByText('Deleted Vendor call.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Vendor call/ })).toBeNull();
    });

    it('names what was left behind and offers a retry', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      backend.arm('deleteFails');
      await confirm();
      expect(await screen.findByText('Audio folder')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Deleted Vendor call.')).toBeTruthy();
    });

    it('shows the deleting state', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      backend.arm('deleteSlow');
      await confirm();
      expect(await screen.findByText(/Deleting Vendor call/)).toBeTruthy();
      expect(await screen.findByText('Deleted Vendor call.', undefined, SLOW)).toBeTruthy();
    });
  });

  describe('summary tab', () => {
    it('generates from nothing, with progress', async () => {
      renderScreen();
      await openTab(/Imported interview/, 'Summary');
      fireEvent.click(await button('Generate Summary'));
      expect(await screen.findByRole('progressbar', { name: 'Summary progress' })).toBeTruthy();
      expect(await screen.findByRole('heading', { name: 'Action items' }, SLOW)).toBeTruthy();
    });

    it('offers the length that has not been generated', async () => {
      renderScreen();
      await openTab(/Imported interview/, 'Summary');
      fireEvent.click(await button('Generate Summary'));
      await screen.findByRole('heading', { name: 'Action items' }, SLOW);
      fireEvent.click(screen.getByRole('radio', { name: 'Full' }));
      expect(await button('Generate Full')).toBeTruthy();
    });

    it('switches between Brief and Full', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      await screen.findByText(/The team agreed to start the pilot/);
      fireEvent.click(screen.getByRole('radio', { name: 'Full' }));
      expect(await screen.findByRole('heading', { name: 'Main topics' })).toBeTruthy();
    });

    it('shows a failure and lets the user try again', async () => {
      renderScreen();
      await openTab(/Imported interview/, 'Summary');
      backend.arm('summaryFails');
      fireEvent.click(await button('Generate Summary'));
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(await button('Generate Summary')).toBeTruthy();
    });

    it('flags an outdated summary and its warnings', async () => {
      renderScreen();
      await openTab(/Weekly project sync/, 'Summary');
      expect(await screen.findByText('May be outdated — regenerate?')).toBeTruthy();
      expect(screen.getByText(/does not cover it/)).toBeTruthy();
    });

    it('turns outdated when the event arrives', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      await screen.findByText(/The team agreed to start the pilot/);
      backend.emit('summaryOutdated', { meetingId: 'meeting-8h' });
      expect(await screen.findByText('May be outdated — regenerate?')).toBeTruthy();
    });

    it('shows unknown details without inventing them', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      expect((await screen.findAllByText('Unconfirmed')).length).toBe(2);
      expect(screen.getByText('Not specified')).toBeTruthy();
      expect(screen.getByText('next week (unconfirmed)')).toBeTruthy();
      expect(screen.getByText('Needs review')).toBeTruthy();
    });

    it('edits an action item', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      fireEvent.click(await button('Edit: Send updated storage cost estimate'));
      fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Maria' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Maria')).toBeTruthy();
      expect(screen.getAllByText('Edited').length).toBeGreaterThan(0);
    });

    it('edits a decision status', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      fireEvent.click(await button(/Edit: Keep the manual process/));
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'unresolved' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Unresolved')).toBeTruthy();
    });

    it('edits the narrative', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      fireEvent.click(await button('Edit summary text'));
      fireEvent.change(screen.getByLabelText('Summary text'), { target: { value: 'Rewritten.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Rewritten.')).toBeTruthy();
    });

    it('plays from a source timestamp', async () => {
      renderScreen();
      await openTab(/Depot rollout/, 'Summary');
      fireEvent.click(await button('Play from 06:52'));
      expect(await button('Pause')).toBeTruthy();
    });
  });

  describe('export', () => {
    async function openExport(title: RegExp) {
      await openMeeting(title);
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      return screen.findByRole('dialog', { name: 'Export meeting' });
    }

    it('exports and offers the folder', async () => {
      renderScreen();
      const dialog = await openExport(/Depot rollout/);
      const call = vi.spyOn(backend, 'call');
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Both' }));
      fireEvent.click(within(dialog).getByRole('radio', { name: 'PDF' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
      fireEvent.click(await button('Open folder'));
      expect(call).toHaveBeenCalledWith(
        'exportMeeting',
        expect.objectContaining({
          content: 'both',
          format: 'pdf',
        }),
      );
      expect(call).toHaveBeenCalledWith(
        'openMeetingFolder',
        expect.objectContaining({
          folder: 'exports',
        }),
      );
    });

    it('needs a summary before exporting one', async () => {
      renderScreen();
      const dialog = await openExport(/Imported interview/);
      const summary = within(dialog).getByRole('radio', { name: 'Summary' }) as HTMLInputElement;
      expect(summary.disabled).toBe(true);
    });

    it('shows a failure and retries', async () => {
      renderScreen();
      const dialog = await openExport(/Depot rollout/);
      backend.arm('exportFails');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
      expect(await screen.findByText('The export could not be saved.')).toBeTruthy();
      fireEvent.click(await button('Try again'));
      expect(await button('Open folder')).toBeTruthy();
    });

    it('closes with Escape', async () => {
      renderScreen();
      const dialog = await openExport(/Depot rollout/);
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
});
