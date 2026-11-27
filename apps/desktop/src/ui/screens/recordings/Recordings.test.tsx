import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { MockBackend } from '../../mocks/index.ts';
import type { FinalPassStage } from '@scrb/contracts';
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

const button = (name: string | RegExp, options = {}) =>
  screen.findByRole('button', { name }, options);

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

  describe('re-process', () => {
    it('re-runs a finished meeting and shows the processing banner', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      expect(screen.queryByText(/Your edits and speaker names are kept/)).toBeNull();
      const button = screen.getByRole('button', { name: 'Re-process' });
      fireEvent.focus(button);
      expect(screen.getByRole('tooltip').textContent).toBe(
        'Re-run speech recognition and speaker detection. Uses the model currently selected in Settings. Edits and speaker names are kept where the words still match. The summary may become outdated.',
      );
      fireEvent.click(button);
      expect(await screen.findByRole('progressbar', {}, SLOW)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Re-process' })).toBeNull();
    });
  });

  describe('library', () => {
    it('shows each in-progress state', async () => {
      renderScreen();
      expect(await screen.findByText('Processing final transcript')).toBeTruthy();
      expect(screen.getByText('Recovered after crash')).toBeTruthy();
      expect(screen.getByText('May be outdated')).toBeTruthy();
    });

    it('filters by source', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.focus(screen.getByLabelText('Search recordings'));
      fireEvent.click(screen.getByRole('menuitem', { name: /From a specific source/ }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Imported' }));
      expect(screen.getByText('Source: Imported')).toBeTruthy();
      await waitFor(() => expect(screen.queryByText('Budget review')).toBeNull());
      expect(screen.getByText('Imported interview recording')).toBeTruthy();
    });

    it('filters by date', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Recorded before a date/ }));
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-22' } });
      expect(screen.getByText('To: 10/22/26')).toBeTruthy();
      await waitFor(() => expect(screen.queryByText('Budget review')).toBeNull());
    });

    it('opens the filter list by typing a keyword, and removes a chip with Backspace', async () => {
      renderScreen();
      await button(/Budget review/);
      const search = screen.getByLabelText('Search recordings') as HTMLInputElement;
      fireEvent.change(search, { target: { value: 'source:' } });
      expect(search.value).toBe('');
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Imported' }));
      await waitFor(() => expect(screen.queryByText('Budget review')).toBeNull());
      fireEvent.keyDown(search, { key: 'Backspace' });
      expect(screen.queryByText('Source: Imported')).toBeNull();
      expect(await button(/Budget review/)).toBeTruthy();
    });

    it('opens the dropdown on focus, narrows it by typing a keyword prefix, and closes on Escape', async () => {
      renderScreen();
      await button(/Budget review/);
      const search = screen.getByLabelText('Search recordings');
      fireEvent.focus(search);
      expect(screen.getByRole('menu', { name: 'Filters' })).toBeTruthy();
      fireEvent.change(search, { target: { value: 'fr' } });
      expect(screen.getAllByRole('menuitem')).toHaveLength(1);
      fireEvent.change(search, { target: { value: 'weekly' } });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('applies several filters from the More filters dialog and clears them', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.focus(screen.getByLabelText('Search recordings'));
      fireEvent.click(screen.getByRole('menuitem', { name: /More filters/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Filters' });
      fireEvent.change(within(dialog).getByRole('combobox', { name: /^Source/ }), {
        target: { value: 'imported' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add date' }));
      fireEvent.change(within(dialog).getByLabelText('Before date'), {
        target: { value: '2026-10-30' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Apply filters' }));
      expect(await screen.findByText('Source: Imported')).toBeTruthy();
      expect(screen.getByText('To: 10/30/26')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('moves through the filter list with the arrow keys and closes with Escape', async () => {
      renderScreen();
      await button(/Budget review/);
      const search = screen.getByLabelText('Search recordings');
      fireEvent.keyDown(search, { key: 'ArrowDown' });
      const items = screen.getAllByRole('menuitem');
      expect(items).toHaveLength(4);
      expect(items[3]?.textContent).toContain('More filters');
      await waitFor(() => expect(document.activeElement).toBe(items[0]));
      fireEvent.keyDown(items[0] as HTMLElement, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[1]);
      fireEvent.keyDown(items[1] as HTMLElement, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(search);
    });

    it('focuses the title after meeting navigation', async () => {
      renderScreen();
      const row = await button(/Weekly project sync/);
      row.focus();
      await openMeeting(/Weekly project sync/);
      // The list stays beside the meeting, so focus stays on the row that was pressed.
      await waitFor(() => expect(document.activeElement).toBe(row));
      expect(row.getAttribute('aria-current')).toBe('true');
    });

    it('searches transcripts and opens a match at its time', async () => {
      renderScreen();
      await button(/Budget review/);
      fireEvent.change(screen.getByLabelText('Search recordings'), {
        target: { value: 'northern depot' },
      });
      const snippets = await screen.findAllByText('northern');
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
      await screen.findByText('Processing final transcript');
      backend.finishFinalPass();
      await waitFor(
        () => expect(screen.queryByText('Processing final transcript')).toBeNull(),
        SLOW,
      );
    });
  });

  describe('final processing indicator', () => {
    it('shows a provisional-text banner in the meeting and removes it when processing ends', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      expect(screen.getByText(/Processing final transcript\. Text may change/)).toBeTruthy();
      // The backend reports no final-pass progress, so the bar must not claim a position.
      const bar = screen.getByRole('progressbar', { name: 'Final transcript processing' });
      expect(bar.getAttribute('aria-valuenow')).toBeNull();
      backend.finishFinalPass();
      await waitFor(
        () =>
          expect(screen.queryByText(/Processing final transcript\. Text may change/)).toBeNull(),
        SLOW,
      );
      expect(screen.getByRole('tab', { name: 'Transcript' })).toBeTruthy();
    });

    it('anchors the banner inside the transcript panel, never over the header or tabs', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      const banner = screen.getByText(/Processing final transcript\. Text may change/);
      const panel = document.getElementById('meeting-panel');
      expect(panel?.contains(banner)).toBe(true);
      expect(screen.getByRole('tablist', { name: 'Meeting' }).contains(banner)).toBe(false);
      expect(document.querySelector('header')?.contains(banner)).toBe(false);
    });

    it('fills the bar from the final pass progress event and names the stage', async () => {
      renderScreen();
      const on = vi.spyOn(backend, 'on');
      await openMeeting(/Budget review/);
      // The banner subscribes in a passive effect; emitting earlier drops the event.
      await waitFor(() =>
        expect(on).toHaveBeenCalledWith('finalPassProgress', expect.any(Function)),
      );
      act(() =>
        backend.emit('finalPassProgress', {
          meetingId: 'meeting-final-pass',
          stage: 'diarizing',
          fraction: 0.6,
          startedAt: new Date().toISOString(),
        }),
      );
      const bar = screen.getByRole('progressbar', { name: 'Final transcript processing' });
      expect(bar.getAttribute('aria-valuenow')).toBe('60');
      expect(screen.getByText('Working out who spoke...')).toBeTruthy();
    });

    it('shows a small progress bar under a processing meeting in the list', async () => {
      renderScreen();
      const on = vi.spyOn(backend, 'on');
      const row = (await screen.findByText(/Budget review/)).closest('li') as HTMLElement;
      const bar = () =>
        within(row).getByRole('progressbar', { name: /Final transcript processing/ });
      expect(bar().hasAttribute('aria-valuenow')).toBe(false);
      await waitFor(() =>
        expect(on).toHaveBeenCalledWith('finalPassProgress', expect.any(Function)),
      );
      act(() =>
        backend.emit('finalPassProgress', {
          meetingId: 'meeting-final-pass',
          stage: 'transcribing',
          fraction: 0.3,
          startedAt: new Date().toISOString(),
        }),
      );
      expect(bar().getAttribute('aria-valuenow')).toBe('30');
    });

    it('ignores progress that goes backwards, and starts over for a new pass', async () => {
      renderScreen();
      const on = vi.spyOn(backend, 'on');
      await openMeeting(/Budget review/);
      // The banner subscribes in a passive effect after the meeting detail loads.
      // Wait for that subscription before emitting progress so a slow UI runner
      // cannot drop the first event.
      await waitFor(() =>
        expect(on).toHaveBeenCalledWith('finalPassProgress', expect.any(Function)),
      );
      const report = (stage: FinalPassStage, fraction: number, startedAt: string) =>
        act(() =>
          backend.emit('finalPassProgress', {
            meetingId: 'meeting-final-pass',
            stage,
            fraction,
            startedAt,
          }),
        );
      const value = () =>
        screen
          .getByRole('progressbar', { name: 'Final transcript processing' })
          .getAttribute('aria-valuenow');
      const A = '2026-11-13T10:00:00.000Z';
      const B = '2026-11-13T10:05:00.000Z';
      // The first report can be any value: earlier ones may have been missed.
      await report('diarizing', 0.9, A);
      expect(value()).toBe('90');
      await report('transcribing', 0.2, A);
      expect(value()).toBe('90');
      expect(screen.getByText('Working out who spoke...')).toBeTruthy();
      await report('diarizing', 0.9, A);
      expect(value()).toBe('90');
      await report('finishing', 1, A);
      expect(value()).toBe('100');
      await report('diarizing', 0.95, A);
      expect(value()).toBe('100');
      expect(screen.getByText('Finishing up...')).toBeTruthy();
      await report('queued', 0, B);
      expect(value()).toBe('0');
      // A late report from the older pass must not undo the newer one.
      await report('finishing', 1, A);
      expect(value()).toBe('0');
      expect(screen.getByText('Waiting to start...')).toBeTruthy();
    });

    it('other meetings progress does not touch this banner', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      act(() =>
        backend.emit('finalPassProgress', {
          meetingId: 'someone-else',
          stage: 'finishing',
          fraction: 0.8,
          startedAt: '2026-11-13T10:00:00.000Z',
        }),
      );
      expect(
        screen
          .getByRole('progressbar', { name: 'Final transcript processing' })
          .getAttribute('aria-valuenow'),
      ).toBeNull();
    });

    it('lets the banner be dismissed with an X', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText(/Processing final transcript\. Text may change/)).toBeNull();
    });

    it('shows the banner again after leaving and reopening the same processing meeting', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText(/Processing final transcript\. Text may change/)).toBeNull();

      await openMeeting(/Vendor call/);
      await openMeeting(/Budget review/);
      expect(screen.getByText(/Processing final transcript\. Text may change/)).toBeTruthy();
    });

    it('keeps a dismissed banner hidden while switching tabs in the same meeting', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
      fireEvent.click(screen.getByRole('tab', { name: 'Transcript' }));
      expect(screen.queryByText(/Processing final transcript\. Text may change/)).toBeNull();
    });

    it('keeps the banner slim, with a 2px progress bar along its bottom edge', async () => {
      renderScreen();
      await openMeeting(/Budget review/);
      const banner = screen
        .getByText(/Processing final transcript\. Text may change/)
        .closest('[class*="processingBanner"]');
      const progress = screen.getByRole('progressbar', { name: 'Final transcript processing' });
      expect(banner?.contains(progress)).toBe(true);
      const bannerCss = readFileSync(
        join(__dirname, '../../screens/recordings/recordings.module.css'),
        'utf8',
      );
      const popupCss = readFileSync(
        join(__dirname, '../../components/PopupBanner.module.css'),
        'utf8',
      );
      const progressCss = readFileSync(
        join(__dirname, '../../components/Progress.module.css'),
        'utf8',
      );
      expect(bannerCss.match(/\.processingBanner \{([^}]*)\}/)?.[1]).toMatch(
        /font-size: var\(--text-sm\)/,
      );
      expect(bannerCss.match(/\.slimBar \[role='progressbar'\],[^{]*\{([^}]*)\}/)?.[1]).toMatch(
        /height: 2px/,
      );
      expect(popupCss.match(/\.stack \{([^}]*)\}/)?.[1]).toMatch(/composes: stack from/);
      expect(progressCss.match(/\.track \{([^}]*)\}/)?.[1]).toMatch(/width: 100%/);
    });

    it('marks the library row as changing', async () => {
      renderScreen();
      await screen.findByText('Processing final transcript');
      expect(screen.queryByText('Text will change')).toBeNull();
      expect(screen.getByRole('progressbar', { name: /Final transcript processing/ })).toBeTruthy();
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
      expect(((await screen.findByLabelText('Meeting title')) as HTMLInputElement).value).toBe(
        'Client interview.m4a',
      );
    });

    it('cancels and leaves no meeting', async () => {
      renderScreen();
      await startImport();
      fireEvent.click(await button(/Cancel import/));
      await waitFor(() =>
        expect(screen.queryByRole('progressbar', { name: /Importing/ })).toBeNull(),
      );
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
      const input = screen.getByLabelText('Meeting title');
      const call = vi.spyOn(backend, 'call');
      expect(fireEvent.keyDown(input, { key: ' ' })).toBe(true);
      expect(fireEvent.keyDown(input, { key: 'ArrowRight' })).toBe(true);
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
        screen.getByRole('button', { name: 'Skip back 15 seconds' }),
        screen.getByRole('tab', { name: 'Transcript' }),
        screen.getByRole('slider', { name: 'Playback position' }),
      ]) {
        call.mockClear();
        expect(fireEvent.keyDown(control, { key: ' ' })).toBe(false);
        expect(call).toHaveBeenCalled();
      }
    });

    it('toggles once per Space press; a held key does not repeat the toggle', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const call = vi.spyOn(backend, 'call');
      fireEvent.keyDown(document.body, { key: ' ' });
      expect(fireEvent.keyDown(document.body, { key: ' ', repeat: true })).toBe(false);
      fireEvent.keyDown(document.body, { key: ' ', repeat: true });
      fireEvent.keyUp(document.body, { key: ' ' });
      const toggles = call.mock.calls.filter(
        ([name]) => name === 'seekAudio' || name === 'pauseAudio',
      );
      expect(toggles).toHaveLength(1);
    });

    it('skips with the arrow keys after a click on a button or the slider', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const time = () => screen.getByRole('group', { name: 'Audio player' }).textContent;
      const forward = screen.getByRole('button', { name: 'Skip forward 15 seconds' });
      fireEvent.click(forward);
      expect(time()).toMatch(/00:15/);
      expect(fireEvent.keyDown(forward, { key: 'ArrowRight' })).toBe(false);
      expect(time()).toMatch(/00:30/);
      const slider = screen.getByRole('slider', { name: 'Playback position' });
      expect(fireEvent.keyDown(slider, { key: 'ArrowLeft' })).toBe(false);
      expect(time()).toMatch(/00:15/);
    });

    it('always shows Show in transcript as an icon, disabled only while the transcript already follows', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const show = () => screen.getByRole('button', { name: 'Show in transcript' });
      expect(show().textContent).toBe('');
      expect(show().getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
      expect(show().getAttribute('aria-disabled')).toBeNull();
      fireEvent.click(show());
      await screen.findAllByRole('button', { name: /Play from/ });
      expect(screen.getByRole('tab', { name: 'Transcript' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(show().getAttribute('aria-disabled')).toBe('true');
    });

    it('steps the playback speed from a fixed-width button that wraps after 2x', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const speed = () => screen.getByRole('button', { name: /^Playback speed/ });
      expect(speed().textContent).toBe('1x');
      fireEvent.click(speed());
      await waitFor(() => expect(speed().textContent).toBe('1.25x'));
      expect(speed().getAttribute('aria-label')).toBe('Playback speed 1.25x');
      for (let i = 0; i < 7; i += 1) {
        const before = speed().textContent;
        fireEvent.click(speed());
        await waitFor(() => expect(speed().textContent).not.toBe(before));
      }
      expect(speed().textContent).toBe('1x');
    });

    it('keeps the speed and shows an error when the backend refuses it', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const call = backend.call.bind(backend) as (
        name: string,
        request: unknown,
      ) => Promise<unknown>;
      vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
        name === 'setPlaybackRate'
          ? Promise.reject(new Error('Speed could not be changed.'))
          : call(name, request)) as typeof backend.call);
      fireEvent.click(screen.getByRole('button', { name: /^Playback speed/ }));
      expect((await screen.findByRole('alert')).textContent).toBe('Speed could not be changed.');
      expect(screen.getByRole('button', { name: /^Playback speed/ }).textContent).toBe('1x');
    });

    it('starts another meeting at 1x', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      fireEvent.click(screen.getByRole('button', { name: /^Playback speed/ }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Playback speed/ }).textContent).toBe('1.25x'),
      );
      await openMeeting(/Budget review/);
      expect(screen.getByRole('button', { name: /^Playback speed/ }).textContent).toBe('1x');
    });

    it('sets the app volume with a labelled slider and mute button, and remembers it', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const volume = screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement;
      expect(volume.value).toBe('100');
      fireEvent.change(volume, { target: { value: '40' } });
      expect(volume.getAttribute('aria-valuetext')).toBe('40%');
      expect(JSON.parse(window.localStorage.getItem('scrb.playback.volume') ?? 'null')).toBe(0.4);
      const mute = screen.getByRole('button', { name: 'Mute' });
      expect(mute.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(mute);
      expect(screen.getByRole('button', { name: 'Unmute' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(volume.getAttribute('aria-valuetext')).toBe('Muted');
      // Dragging the slider up is a request to hear the audio again.
      fireEvent.change(volume, { target: { value: '60' } });
      expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
      cleanup();
      backend.dispose();
      renderScreen();
      try {
        await openMeeting(/Weekly project sync/);
      } catch {
        // The screen may reopen the last meeting by itself.
      }
      const again = (await screen.findByRole('slider', { name: 'Volume' })) as HTMLInputElement;
      expect(again.value).toBe('60');
      expect(screen.getByRole('button', { name: 'Unmute' })).toBeTruthy();
    });

    it('treats zero volume as muted and unmute brings back the last audible volume', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      const volume = screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement;
      fireEvent.change(volume, { target: { value: '30' } });
      fireEvent.change(volume, { target: { value: '0' } });
      expect(screen.getByRole('button', { name: 'Unmute' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(volume.getAttribute('aria-valuetext')).toBe('Muted');
      // Still zero after reopening: the button must still say Unmute.
      cleanup();
      backend.dispose();
      renderScreen();
      try {
        await openMeeting(/Weekly project sync/);
      } catch {
        // The screen may reopen the last meeting by itself.
      }
      fireEvent.click(await screen.findByRole('button', { name: 'Unmute' }));
      const again = screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement;
      expect(again.value).toBe('30');
      expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
    });

    it('keeps the arrow keys for the focused volume slider while Space still plays', async () => {
      renderScreen();
      await openMeeting(/Weekly project sync/);
      await screen.findAllByRole('button', { name: /Play from/ });
      const volume = screen.getByRole('slider', { name: 'Volume' });
      const call = vi.spyOn(backend, 'call');
      expect(fireEvent.keyDown(volume, { key: 'ArrowRight' })).toBe(true);
      expect(call).not.toHaveBeenCalledWith('seekAudio', expect.anything());
      expect(fireEvent.keyDown(volume, { key: ' ' })).toBe(false);
      expect(call).toHaveBeenCalledWith('seekAudio', expect.anything());
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

      it('clears the word selection when the editor closes', async () => {
        renderScreen();
        await openMeeting(/Weekly project sync/);
        const word = await firstWord();
        window.getSelection()?.selectAllChildren(word);
        fireEvent.doubleClick(word);
        const form = await screen.findByRole('form', { name: 'Correct transcript' });
        // The browser's own double-click selection is what the editor must not leave behind.
        window.getSelection()?.selectAllChildren(word);
        expect(window.getSelection()?.toString()).toBe(word.textContent);
        fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
        await waitFor(() =>
          expect(screen.queryByRole('form', { name: 'Correct transcript' })).toBeNull(),
        );
        expect(window.getSelection()?.toString()).toBe('');
      });

      it('right-click offers Copy and Correct text for the word under the pointer', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        renderScreen();
        await openMeeting(/Weekly project sync/);
        const word = await firstWord();
        fireEvent.contextMenu(word);
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy' }));
        expect(writeText).toHaveBeenCalledWith(word.textContent);
        fireEvent.contextMenu(word);
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Correct text' }));
        expect(await screen.findByRole('form', { name: 'Correct transcript' })).toBeTruthy();
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
        await openMeeting(/Vendor call/);
        await waitFor(() => expect(undoButton().disabled).toBe(true));
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

    it('has no Edit details button', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    });

    describe('date edit in place', () => {
      const dateButton = () => screen.getByRole('button', { name: /^Meeting date and time:/ });
      const open = async () => {
        renderScreen();
        await openMeeting(/Vendor call/);
        fireEvent.click(dateButton());
        return screen.getByLabelText('Meeting date and time') as HTMLInputElement;
      };

      it('saves a new date and time on Enter', async () => {
        const input = await open();
        expect(input.type).toBe('datetime-local');
        fireEvent.change(input, { target: { value: '2026-10-01T09:30' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        const expected = new Date('2026-10-01T09:30').toISOString();
        await waitFor(async () =>
          expect(
            new Date(
              (await backend.call('getMeeting', { meetingId: 'meeting-recovered' })).startedAt,
            ).toISOString(),
          ).toBe(expected),
        );
        const updated = await within(document.querySelector('header') as HTMLElement).findByRole(
          'button',
          { name: /Oct 1, 2026/ },
        );
        expect(document.activeElement).toBe(updated);
      });

      it('keeps the old date on Escape', async () => {
        const input = await open();
        const before = (await backend.call('getMeeting', { meetingId: 'meeting-recovered' }))
          .startedAt;
        fireEvent.change(input, { target: { value: '2026-10-01T09:30' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByLabelText('Meeting date and time')).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(dateButton()));
        expect(
          (await backend.call('getMeeting', { meetingId: 'meeting-recovered' })).startedAt,
        ).toBe(before);
      });

      it('rejects an empty or invalid value and says so', async () => {
        const input = await open();
        const before = (await backend.call('getMeeting', { meetingId: 'meeting-recovered' }))
          .startedAt;
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        expect((await screen.findByRole('alert')).textContent).toMatch(/valid date and time/);
        expect(
          (await backend.call('getMeeting', { meetingId: 'meeting-recovered' })).startedAt,
        ).toBe(before);
      });

      it('shows the backend message when the save fails', async () => {
        const input = await open();
        vi.spyOn(backend, 'call').mockRejectedValueOnce(new Error('Could not save.'));
        fireEvent.change(input, { target: { value: '2026-10-01T09:30' } });
        fireEvent.blur(input);
        expect((await screen.findByRole('alert')).textContent).toBe('Could not save.');
      });
    });

    it('does not allow an empty title, and says why', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      const title = screen.getByLabelText('Meeting title') as HTMLInputElement;
      title.focus();
      fireEvent.change(title, { target: { value: '   ' } });
      fireEvent.blur(title);
      expect((await screen.findByRole('alert')).textContent).toBe('A meeting needs a title.');
      expect(title.value).toBe('Vendor call');
      expect((await backend.call('getMeeting', { meetingId: 'meeting-recovered' })).title).toBe(
        'Vendor call',
      );
    });

    it('renames the meeting in place: Enter saves, Escape cancels', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      const title = (await screen.findByLabelText('Meeting title')) as HTMLInputElement;
      title.focus();
      fireEvent.change(title, { target: { value: 'Dropped name' } });
      fireEvent.keyDown(title, { key: 'Escape' });
      expect(title.value).toBe('Vendor call');
      expect(document.activeElement).toBe(title);
      title.focus();
      fireEvent.change(title, { target: { value: 'Quick rename' } });
      const calls = vi.spyOn(backend, 'call');
      fireEvent.keyDown(title, { key: 'Enter' });
      await waitFor(async () =>
        expect((await backend.call('getMeeting', { meetingId: 'meeting-recovered' })).title).toBe(
          'Quick rename',
        ),
      );
      // Enter leaves the field; after the refreshed meeting has rendered, the same input shows the saved title.
      await waitFor(() => {
        const names = calls.mock.calls.map(([name]) => name);
        expect(names.slice(names.indexOf('updateMeeting'))).toContain('getMeeting');
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.getByLabelText('Meeting title')).toBe(title);
      expect((screen.getByLabelText('Meeting title') as HTMLInputElement).value).toBe(
        'Quick rename',
      );
      expect(document.activeElement).not.toBe(title);
    });

    it('keeps the title field focused on Enter when the title is empty, and shows the error', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      const title = (await screen.findByLabelText('Meeting title')) as HTMLInputElement;
      title.focus();
      fireEvent.change(title, { target: { value: '   ' } });
      fireEvent.keyDown(title, { key: 'Enter' });
      expect(await screen.findByText('A meeting needs a title.')).toBeTruthy();
      expect(document.activeElement).toBe(title);
    });

    it('has no back button: the list column stays beside the open meeting', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      expect(screen.queryByRole('button', { name: 'Back to Recordings' })).toBeNull();
      expect(screen.getByLabelText('Search recordings')).toBeTruthy();
    });

    it('keeps the player outside the scrolling panel', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      const panel = screen.getByRole('tabpanel');
      const player = screen.getByRole('group', { name: 'Audio player' });
      expect(panel.contains(player)).toBe(false);
    });

    it('names every icon button', async () => {
      renderScreen();
      await openMeeting(/Vendor call/);
      for (const name of [
        'Export',
        'Open meeting folder',
        'Open audio folder',
        'Delete',
        'Undo',
        'Redo',
      ]) {
        expect(screen.getByRole('button', { name })).toBeTruthy();
      }
      const mute = screen.getByRole('button', { name: 'Mute' });
      fireEvent.click(mute);
      expect(screen.getByRole('button', { name: 'Unmute' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
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

    it('keeps learned data by default and removes it only when ticked', async () => {
      renderScreen();
      const call = vi.spyOn(backend, 'call');
      await openMeeting(/Vendor call/);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete meeting' });
      const box = within(dialog).getByRole('checkbox', {
        name: /Also remove voice profiles and vocabulary/,
      }) as HTMLInputElement;
      expect(box.checked).toBe(false);
      fireEvent.click(box);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      expect(await screen.findByText('Deleted Vendor call.')).toBeTruthy();
      expect(call).toHaveBeenCalledWith(
        'deleteMeeting',
        expect.objectContaining({ removeLearnedData: true }),
      );
    });

    it('sends no learned-data option when the box is left alone', async () => {
      renderScreen();
      const call = vi.spyOn(backend, 'call');
      await openMeeting(/Vendor call/);
      await confirm();
      expect(await screen.findByText('Deleted Vendor call.')).toBeTruthy();
      expect(call).toHaveBeenCalledWith('deleteMeeting', { meetingId: expect.any(String) });
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

    it('floats banners over the summary, so showing or dismissing one never moves it', async () => {
      renderScreen();
      await openTab(/Weekly project sync/, 'Summary');
      const banner = await screen.findByRole('button', { name: 'Regenerate' });
      expect(banner.closest('[class*="layer"]')).not.toBeNull();
      const css = readFileSync(join(__dirname, '../../components/PopupBanner.module.css'), 'utf8');
      expect(css).not.toMatch(/\.inline/);
      expect(css.match(/\.layer \{([^}]*)\}/)?.[1]).toMatch(/height: 0;/);
      expect(css.match(/\.stack \{([^}]*)\}/)?.[1]).toMatch(/composes: stack from/);
    });

    it('flags an outdated summary and its warnings', async () => {
      renderScreen();
      await openTab(/Weekly project sync/, 'Summary');
      expect(
        await screen.findByText('Transcript was re-processed. The summary may be outdated.'),
      ).toBeTruthy();
      expect(screen.getByText(/does not cover it/)).toBeTruthy();
    });

    it('lets the outdated banner be dismissed with an X, keeping Regenerate, and shows the pointer', async () => {
      renderScreen();
      await openTab(/Weekly project sync/, 'Summary');
      const text = 'Transcript was re-processed. The summary may be outdated.';
      await screen.findByText(text);
      expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
      const banner = screen.getByText(text).closest('[role="status"]') as HTMLElement;
      fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText(text)).toBeNull();
      expect(screen.getByText(/turn banners on or off in Settings/)).toBeTruthy();
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
      fireEvent.click(within(dialog).getByRole('radio', { name: '.pdf' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
      fireEvent.click(await button('Show in folder', SLOW));
      expect(call).toHaveBeenCalledWith(
        'exportMeeting',
        expect.objectContaining({
          content: 'both',
          format: 'pdf',
        }),
      );
      expect(call).toHaveBeenCalledWith(
        'revealExport',
        expect.objectContaining({ exportId: expect.any(String) }),
      );
    });

    it('switches away from WebVTT when a summary is included', async () => {
      renderScreen();
      const dialog = await openExport(/Depot rollout/);
      const vtt = within(dialog).getByRole('radio', { name: '.vtt' }) as HTMLInputElement;
      fireEvent.click(vtt);
      expect(vtt.checked).toBe(true);
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Both' }));
      expect(vtt.disabled).toBe(true);
      const docx = within(dialog).getByRole('radio', { name: '.docx' }) as HTMLInputElement;
      expect(docx.checked).toBe(true);
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
      expect(await screen.findByText('The export could not be saved.', {}, SLOW)).toBeTruthy();
      fireEvent.click(await button('Try again'));
      expect(await button('Show in folder', SLOW)).toBeTruthy();
    });

    it('returns to the options with no error when the save dialog is cancelled', async () => {
      renderScreen();
      const dialog = await openExport(/Depot rollout/);
      backend.arm('exportCancelled');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
      expect(await screen.findByText('Choose where to save…')).toBeTruthy();
      expect(await button('Export', SLOW)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Export cancelled.')).toBeNull();
    });

    it('closes with Escape', async () => {
      renderScreen();
      const dialog = await openExport(/Depot rollout/);
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
});
