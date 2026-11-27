import { chooseOption } from '../components/choose-option.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Backend } from '@scrb/contracts';
import { SpeakerSuggestionsProvider } from '../components/speakers/SpeakerSuggestions.tsx';
import { BackendProvider } from '../lib/backend-context.tsx';
import { createHybridBackend } from '../lib/hybrid-backend.ts';
import { forgetSources } from '../lib/sources-cache.ts';
import { MockBackend } from '../mocks/index.ts';
import { ThemeProvider } from '../theme/ThemeProvider.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { SpeakersScreen } from './SpeakersScreen.tsx';
import { MeetingSpeakersTab } from './speakers/MeetingSpeakers.tsx';
import { VocabularyScreen } from './VocabularyScreen.tsx';

function renderScreen(backend: Backend, node: ReactNode) {
  return render(
    <BackendProvider backend={backend}>
      <ThemeProvider>
        <SpeakerSuggestionsProvider>{node}</SpeakerSuggestionsProvider>
      </ThemeProvider>
    </BackendProvider>,
  );
}

const saveBar = () => screen.findByText('You have unsaved changes.');

describe('screens', () => {
  let backend: MockBackend;

  beforeEach(() => {
    window.localStorage.clear();
    backend = new MockBackend();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
    vi.unstubAllGlobals();
  });

  describe('Speakers', () => {
    it('shows the empty state in the list column', async () => {
      backend.setProfiles([]);
      renderScreen(backend, <SpeakersScreen />);
      const empty = (await screen.findByText('No voice profiles yet')).parentElement;
      expect(empty?.className).toMatch(/emptyCompact/);
      expect(await screen.findByText('Select a voice')).toBeTruthy();
    });

    it('lists the voices in the shared list column and selects the first', async () => {
      renderScreen(backend, <SpeakersScreen />);
      const rows = within(await screen.findByRole('list', { name: 'Voice profiles' }));
      const buttons = rows.getAllByRole('button');
      expect(buttons).toHaveLength(3);
      expect(buttons[0]?.getAttribute('aria-current')).toBe('true');
      expect(buttons[0]?.closest('[data-split]')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: 'Priya Natarajan' })).toBeTruthy();
      fireEvent.click(buttons[1] as HTMLElement);
      expect(screen.getByRole('heading', { level: 2, name: 'Tomas Lindgren' })).toBeTruthy();
      expect(buttons[1]?.getAttribute('aria-current')).toBe('true');
    });

    it('offers the five actions, with Split explained rather than hidden', async () => {
      renderScreen(backend, <SpeakersScreen />);
      await screen.findByRole('heading', { level: 2, name: 'Priya Natarajan' });
      for (const name of [
        'Play sample of Priya Natarajan',
        'Rename Priya Natarajan',
        'Merge Priya Natarajan into another voice',
        'Delete Priya Natarajan',
      ]) {
        expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
      }
      expect(
        (
          screen.getByRole('button', {
            name: 'Split Priya Natarajan into two voices',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it('renames the selected profile', async () => {
      renderScreen(backend, <SpeakersScreen />);
      const rows = within(await screen.findByRole('list', { name: 'Voice profiles' }));
      fireEvent.click(rows.getByRole('button', { name: /Unnamed voice/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Rename Unnamed voice' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Mina Sato' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      expect(await screen.findByRole('heading', { level: 2, name: 'Mina Sato' })).toBeTruthy();
    });

    it('merges two profiles and adds their meetings', async () => {
      renderScreen(backend, <SpeakersScreen />);
      const rows = within(await screen.findByRole('list', { name: 'Voice profiles' }));
      fireEvent.click(rows.getByRole('button', { name: /Tomas Lindgren/ }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Merge Tomas Lindgren into another voice' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
      await vi.waitFor(() => expect(screen.queryByText('Tomas Lindgren')).toBeNull());
      expect((await screen.findAllByText(/23 meetings/)).length).toBeGreaterThan(0);
    });

    it('shows a deleting state, then removes the profile', async () => {
      renderScreen(backend, <SpeakersScreen />);
      const rows = within(await screen.findByRole('list', { name: 'Voice profiles' }));
      fireEvent.click(rows.getByRole('button', { name: /Tomas Lindgren/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete Tomas Lindgren' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
      expect((await screen.findAllByText('Deleting…')).length).toBeGreaterThan(0);
      await vi.waitFor(() => expect(screen.queryByText('Tomas Lindgren')).toBeNull(), {
        timeout: 2000,
      });
    });

    it('keeps the profile and says so in a dismissible banner when delete fails', async () => {
      backend.arm('profileDeleteFails');
      renderScreen(backend, <SpeakersScreen />);
      const rows = within(await screen.findByRole('list', { name: 'Voice profiles' }));
      fireEvent.click(rows.getByRole('button', { name: /Tomas Lindgren/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete Tomas Lindgren' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
      const alert = await screen.findByRole('alert', {}, { timeout: 2000 });
      expect(alert.textContent).toContain('could not be deleted');
      expect(screen.getAllByText('Tomas Lindgren').length).toBeGreaterThan(0);
      fireEvent.click(within(alert).getByRole('button', { name: /Dismiss/ }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('confirms a suggested match', async () => {
      renderScreen(backend, <SpeakersScreen />);
      await screen.findByRole('list', { name: 'Voice profiles' });
      backend.emit('speakerSuggestion', {
        meetingId: 'meeting-outdated',
        speakerId: 'sp-3',
        profileId: 'profile-2',
        profileName: 'Tomas Lindgren',
      });
      expect(await screen.findByText(/Weekly project sync/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Yes, same person' }));
      await vi.waitFor(() => expect(screen.queryByText('Suggested matches')).toBeNull());
      const page = await backend.call('getTranscript', {
        meetingId: 'meeting-outdated',
        offset: 0,
        limit: 1,
      });
      expect(page.speakers.find((speaker) => speaker.id === 'sp-3')?.label).toBe('Tomas Lindgren');
    });

    it('uses only tonal styling: no borders in the Speakers styles', () => {
      const css = readFileSync(join(__dirname, 'SpeakersScreen.module.css'), 'utf8');
      expect(css).not.toMatch(/border(?!-radius)/);
    });
  });

  describe('Meeting Speakers tab', () => {
    it('splits part of a speaker from a meeting', async () => {
      render(
        <BackendProvider backend={backend}>
          <ThemeProvider>
            <MeetingSpeakersTab meetingId="meeting-outdated" onChanged={() => undefined} />
          </ThemeProvider>
        </BackendProvider>,
      );
      fireEvent.click(
        (
          await screen.findAllByRole('button', { name: /^Split .* into two speakers$/ })
        )[0] as HTMLElement,
      );
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.change(dialog.getByRole('textbox', { name: 'New speaker name' }), {
        target: { value: 'Ben Okafor' },
      });
      const lines = dialog.getAllByRole('checkbox');
      fireEvent.click(lines[0] as HTMLElement);
      fireEvent.click(lines[1] as HTMLElement);
      fireEvent.click(dialog.getByRole('button', { name: 'Split' }));
      expect(await screen.findByText('Ben Okafor')).toBeTruthy();
      const page = await backend.call('getTranscript', {
        meetingId: 'meeting-outdated',
        offset: 0,
        limit: 1000,
      });
      const added = page.speakers.find((speaker) => speaker.label === 'Ben Okafor');
      const count = page.segments.filter((segment) => segment.speakerId === added?.id).length;
      expect(count).toBe(2);
      expect(page.speakers.filter((speaker) => speaker.label === 'Ben Okafor')).toHaveLength(1);
    });

    it('renames and merges speakers of the meeting', async () => {
      render(
        <BackendProvider backend={backend}>
          <ThemeProvider>
            <MeetingSpeakersTab meetingId="meeting-outdated" onChanged={() => undefined} />
          </ThemeProvider>
        </BackendProvider>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Rename Speaker 2' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Ana Ruiz' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      expect(await screen.findByText('Ana Ruiz')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Merge Ana Ruiz into another speaker' }));
      fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
      await vi.waitFor(() => expect(screen.queryByText('Ana Ruiz')).toBeNull());
    });
  });

  describe('Vocabulary', () => {
    const openFilter = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Filter terms' }));
      await screen.findByRole('menu', { name: 'Show terms' });
    };

    const pick = async (name: string) => {
      const row = await screen.findByText(name, { selector: 'span' });
      fireEvent.click(row.closest('button') as HTMLElement);
    };

    it('focuses the heading after deleting a term', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Kestrel API');
      const remove = await screen.findByRole('button', { name: 'Delete Kestrel API' });
      remove.focus();
      fireEvent.click(remove);
      const confirm = screen.getByRole('button', { name: 'Delete term' });
      confirm.focus();
      fireEvent.click(confirm);
      await waitFor(() => expect(screen.queryByText('Kestrel API')).toBeNull());
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Vocabulary' })),
      );
    });

    it('says how many terms are enabled and that they are not used yet', async () => {
      renderScreen(backend, <VocabularyScreen />);
      const terms = await backend.call('listTerms');
      const enabled = terms.filter((term) => term.enabled).length;
      expect(
        await screen.findByRole('button', {
          name: `${enabled} enabled. Terms are saved but not used for transcription yet.`,
        }),
      ).toBeTruthy();
    });

    it('filters by state with counts, lists suggestions first, and tags rows', async () => {
      renderScreen(backend, <VocabularyScreen />);
      const terms = await backend.call('listTerms');
      const off = terms.filter((term) => !term.enabled).length;
      await screen.findByText('Kestrel API', { selector: 'span' });
      await openFilter();
      expect(screen.getByRole('menuitemradio', { name: `All (${terms.length + 2})` })).toBeTruthy();
      expect(screen.getByRole('menuitemradio', { name: 'Suggested (2)' })).toBeTruthy();
      expect(
        screen.getByRole('menuitemradio', { name: `Enabled (${terms.length - off})` }),
      ).toBeTruthy();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      const names = () =>
        screen
          .getAllByRole('button', { name: /./ })
          .filter(
            (button) =>
              button.getAttribute('aria-current') !== null || button.className.includes('entry'),
          )
          .map((button) => button.querySelector('span')?.textContent);
      expect(names()[0]).toBe('Marlow Quay');
      expect(screen.getAllByText('Suggested', { selector: 'span' }).length).toBeGreaterThanOrEqual(
        2,
      );
      await openFilter();
      fireEvent.click(screen.getByRole('menuitemradio', { name: `Disabled (${off})` }));
      expect(screen.queryByText('Marlow Quay', { selector: 'span' })).toBeNull();
      expect(screen.queryByText(/Heard as:/)).toBeNull();
    });

    it('opens on the first suggestion, and marks the selected term', async () => {
      renderScreen(backend, <VocabularyScreen />);
      expect(await screen.findByRole('button', { name: 'Remember Marlow Quay' })).toBeTruthy();
      await pick('Kestrel API');
      expect(screen.queryByRole('button', { name: 'Remember Marlow Quay' })).toBeNull();
      const row = screen.getByText('Kestrel API', { selector: 'span' }).closest('button');
      expect(row?.getAttribute('aria-current')).toBe('true');
      expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
    });

    it('filters the list by spelling or misheard version', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await screen.findByText('Kestrel API', { selector: 'span' });
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search vocabulary' }), {
        target: { value: 'kestrel' },
      });
      expect(screen.queryByText('Halden Depot', { selector: 'span' })).toBeNull();
      expect(screen.getByText('Kestrel API', { selector: 'span' })).toBeTruthy();
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search vocabulary' }), {
        target: { value: 'zzzz' },
      });
      expect(screen.getByText('No matching terms.')).toBeTruthy();
    });

    it('shows a suggestion with its counts and misheard forms', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Marlow Quay');
      expect(await screen.findByText('4 corrections in 3 meetings')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Heard as' })).toBeTruthy();
      await pick('Tessel');
      expect(await screen.findByText('2 corrections in 2 meetings')).toBeTruthy();
    });

    it('remembers a suggestion and refreshes the groups', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Marlow Quay');
      fireEvent.click(await screen.findByRole('button', { name: 'Remember Marlow Quay' }));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Remember Marlow Quay' })).toBeNull(),
      );
      await openFilter();
      expect(screen.getByRole('menuitemradio', { name: 'Suggested (1)' })).toBeTruthy();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      await pick('Marlow Quay');
      expect(await screen.findByRole('button', { name: 'Edit Marlow Quay' })).toBeTruthy();
    });

    it('dismisses a suggestion without adding a term', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Tessel');
      fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Tessel' }));
      await waitFor(() => expect(screen.queryByText('Tessel')).toBeNull());
      expect((await backend.call('listTerms')).some((term) => term.term === 'Tessel')).toBe(false);
    });

    it('shows an error and refreshes when a suggestion changed', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Tessel');
      const remember = await screen.findByRole('button', { name: 'Remember Tessel' });
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-2', accepted: false });
      fireEvent.click(remember);
      expect((await screen.findByRole('alert')).textContent).toBe('That suggestion changed.');
      await waitFor(() => expect(screen.queryByText('Tessel')).toBeNull());
    });

    it('hides the Suggested filter when there are no suggestions', async () => {
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-1', accepted: false });
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-2', accepted: false });
      renderScreen(backend, <VocabularyScreen />);
      await screen.findByText('Kestrel API');
      await openFilter();
      expect(screen.queryByRole('menuitemradio', { name: /^Suggested/ })).toBeNull();
    });

    it('shows the empty state', async () => {
      backend.setTerms([]);
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-1', accepted: false });
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-2', accepted: false });
      renderScreen(backend, <VocabularyScreen />);
      expect(await screen.findByText('No terms yet')).toBeTruthy();
    });

    it('marks a disabled entry and enables it', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Q-Track');
      // One badge in the list row, one beside the name in the panel.
      expect((await screen.findAllByText('Disabled', { selector: 'span' })).length).toBe(2);
      fireEvent.click(screen.getByRole('button', { name: 'Enable Q-Track' }));
      await vi.waitFor(() =>
        expect(screen.queryAllByText('Disabled', { selector: 'span' }).length).toBe(0),
      );
      const terms = await backend.call('listTerms');
      expect(terms.find((term) => term.id === 'term-3')?.history.at(-1)?.action).toBe('enabled');
    });

    it('edits spelling and misheard versions', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Kestrel API');
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Kestrel API' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Correct spelling' }), {
        target: { value: 'Kestrel Gateway' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /Misheard/ }), {
        target: { value: 'castrol api\n  kessel gateway  \n\ncastrol api' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('heading', { name: 'Kestrel Gateway' })).toBeTruthy();
      const term = (await backend.call('listTerms')).find((item) => item.id === 'term-2');
      expect(term?.misheard).toEqual(['castrol api', 'kessel gateway']);
    });

    it('deletes a term after confirming', async () => {
      renderScreen(backend, <VocabularyScreen />);
      await pick('Halden Depot');
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Halden Depot' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete term' }));
      await vi.waitFor(() => expect(screen.queryByText('Halden Depot')).toBeNull());
    });
  });

  describe('Settings', () => {
    it('positions Test mic above Input Profile and groups controls beneath it', async () => {
      renderScreen(backend, <SettingsScreen />);
      const section = await screen.findByRole('region', { name: 'Audio' });
      const profile = within(section).getByRole('group', { name: /^Input Profile/ });
      expect(within(profile).getByRole('radio', { name: /^Voice Isolation/ })).toBeTruthy();
      expect(within(profile).getByRole('radio', { name: /^Studio/ })).toBeTruthy();
      expect(within(profile).getByRole('radio', { name: /^Custom/ })).toBeTruthy();
      expect(within(profile).getByRole('button', { name: 'About presets' })).toBeTruthy();

      const testMic = within(section).getByRole('button', { name: 'Test mic' });
      const micMeter = within(section).getByRole('meter', { name: 'Mic level' });
      expect(
        testMic.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        testMic.compareDocumentPosition(micMeter) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(section).queryByRole('meter', { name: 'Meeting level' })).toBeNull();

      const ordered = [
        testMic,
        profile,
        within(section).getByRole('combobox', { name: 'Noise suppression' }),
        within(section).getByRole('checkbox', { name: /Echo cancellation/ }),
        within(section).getByRole('checkbox', { name: /Automatic gain control/ }),
        within(section).getByRole('checkbox', { name: /Bypass system audio/ }),
        within(section).getByLabelText('Input sensitivity'),
        within(section).getByRole('checkbox', { name: /Advanced voice activity/ }),
        within(section).getByRole('checkbox', { name: /No audio detected warning/ }),
        within(section).getByRole('checkbox', { name: /Audio device suggestions/ }),
        within(section).getByRole('combobox', { name: 'Microphone' }),
        within(section).getByRole('combobox', { name: 'Meeting app' }),
      ];
      for (let index = 0; index < ordered.length - 1; index++) {
        expect(
          ordered[index]!.compareDocumentPosition(ordered[index + 1]!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('jumps to a settings group and follows the workspace as it scrolls', async () => {
      renderScreen(backend, <SettingsScreen />);
      const nav = await screen.findByRole('navigation', { name: 'Settings groups' });
      // findBy can resolve before React runs the nav's effects; wait so its scroll listener exists.
      await act(async () => {});
      const buttons = within(nav).getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual([
        'Theme',
        'Audio',
        'Transcription',
        'Models',
        'Storage',
        'Location',
        'Notifications',
      ]);
      const theme = document.getElementById('settings-theme')!;
      const audio = document.getElementById('settings-audio')!;
      expect(theme.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const workspace = document.querySelector<HTMLElement>('[data-split-content]') as HTMLElement;
      const scrollTo = vi.fn();
      workspace.scrollTo = scrollTo;
      Object.defineProperties(workspace, {
        clientHeight: { value: 500 },
        scrollHeight: { value: 1600 },
      });
      const sections = workspace.querySelectorAll('section');
      sections.forEach((section, index) => {
        section.getBoundingClientRect = () =>
          new DOMRect(200, index * 260 - workspace.scrollTop, 500, 260);
      });

      // jsdom has no layout, so the group list can only learn the real positions from a scroll.
      fireEvent.scroll(workspace);
      fireEvent.click(buttons[1]!);
      expect(scrollTo).toHaveBeenCalledWith({ top: 260, behavior: 'smooth' });
      expect(buttons[0]?.getAttribute('aria-current')).toBe('true');

      workspace.scrollTop = 270;
      fireEvent.scroll(workspace);
      expect(buttons[1]?.getAttribute('aria-current')).toBe('true');

      workspace.scrollTop = 960;
      fireEvent.scroll(workspace);
      expect(buttons[4]?.getAttribute('aria-current')).toBe('true');

      workspace.scrollTop = 1100;
      fireEvent.scroll(workspace);
      expect(buttons[6]?.getAttribute('aria-current')).toBe('true');

      workspace.scrollTop = 0;
      fireEvent.scroll(workspace);
      expect(buttons[0]?.getAttribute('aria-current')).toBe('true');
    });

    it('shows stored presets as unavailable without creating unsaved changes', async () => {
      const original = (await backend.call('getSettings')).audio;
      renderScreen(backend, <SettingsScreen />);
      expect(
        await screen.findByText(
          /coming in a later version\. They do not change your recordings yet\. Echo cancellation and Bypass only affect an experimental macOS path that is off by default/,
        ),
      ).toBeTruthy();
      for (const name of ['Voice Isolation', 'Studio', 'Custom']) {
        const profile = screen.getByRole('radio', {
          name: new RegExp(`^${name}`),
        }) as HTMLInputElement;
        expect(profile.disabled).toBe(true);
        expect(profile.getAttribute('aria-describedby')).toBe('audio-processing-unavailable');
      }
      expect(
        (screen.getByRole('radio', { name: /^Voice Isolation/ }) as HTMLInputElement).checked,
      ).toBe(true);
      expect(
        screen.getByText(
          /Separately enabled experimental macOS AEC can still use echo cancellation/,
        ),
      ).toBeTruthy();
      expect(screen.queryByText('You have unsaved changes.')).toBeNull();
      expect((await backend.call('getSettings')).audio).toEqual(original);
    });

    it('disables inert processing settings but keeps their saved values', async () => {
      const original = (await backend.call('getSettings')).audio;
      await backend.call('updateSettings', {
        audio: {
          preset: 'custom',
          noiseSuppression: 'strong',
          echoCancellation: true,
          advancedVoiceActivity: true,
          inputSensitivityDb: -27,
        },
      });
      const saved = (await backend.call('getSettings')).audio;
      renderScreen(backend, <SettingsScreen />);
      const noiseSuppression = await screen.findByRole('combobox', {
        name: 'Noise suppression',
      });
      const controls = [
        noiseSuppression,
        screen.getByRole('checkbox', { name: /Automatic gain control/ }),
        screen.getByLabelText('Input sensitivity'),
        screen.getByRole('checkbox', { name: /^Automatic$/ }),
        screen.getByRole('checkbox', { name: /Advanced voice activity/ }),
        screen.getByRole('checkbox', { name: /No audio detected warning/ }),
        screen.getByRole('checkbox', { name: /Audio device suggestions/ }),
      ];
      for (const control of controls) {
        expect((control as HTMLInputElement).disabled).toBe(true);
        expect(control.getAttribute('aria-describedby')).toBe('audio-processing-unavailable');
      }
      expect(
        (screen.getByRole('combobox', { name: 'Noise suppression' }) as HTMLSelectElement).value,
      ).toBe('strong');
      expect((screen.getByLabelText('Input sensitivity') as HTMLInputElement).value).toBe('-27');
      const echo = screen.getByRole('checkbox', {
        name: /Echo cancellation/,
      }) as HTMLInputElement;
      const bypass = screen.getByRole('checkbox', {
        name: /Bypass system audio/,
      }) as HTMLInputElement;
      for (const experimental of [echo, bypass]) {
        expect(experimental.disabled).toBe(false);
        expect(experimental.getAttribute('aria-describedby')).toBe('audio-processing-unavailable');
      }
      expect(echo.checked).toBe(true);
      expect(
        (screen.getByRole('checkbox', { name: /Advanced voice activity/ }) as HTMLInputElement)
          .checked,
      ).toBe(true);
      expect((screen.getByRole('radio', { name: /^Custom/ }) as HTMLInputElement).checked).toBe(
        true,
      );
      expect((await backend.call('getSettings')).audio).toEqual(saved);
      expect(saved.preset).not.toBe(original.preset);
      expect(screen.queryByText('You have unsaved changes.')).toBeNull();
    });

    it('preserves experimental macOS AEC opt-out controls without enabling normal DSP', async () => {
      const original = (await backend.call('getSettings')).audio;
      renderScreen(backend, <SettingsScreen />);
      const echo = (await screen.findByRole('checkbox', {
        name: /Echo cancellation/,
      })) as HTMLInputElement;
      const bypass = screen.getByRole('checkbox', {
        name: /Bypass system audio/,
      }) as HTMLInputElement;
      expect(echo.disabled).toBe(false);
      expect(bypass.disabled).toBe(false);
      fireEvent.click(echo);
      fireEvent.click(bypass);
      expect(await saveBar()).toBeTruthy();
      expect((screen.getByRole('radio', { name: /^Custom/ }) as HTMLInputElement).checked).toBe(
        true,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() => expect(screen.queryByText('You have unsaved changes.')).toBeNull());
      const updated = (await backend.call('getSettings')).audio;
      expect(updated.echoCancellation).toBe(!original.echoCancellation);
      expect(updated.bypassSystemInputProcessing).toBe(!original.bypassSystemInputProcessing);
      expect(updated.preset).toBe('custom');
      expect(updated.noiseSuppression).toBe(original.noiseSuppression);
      expect(updated.automaticGainControl).toBe(original.automaticGainControl);
    });

    it('keeps working microphone and meeting-source selectors editable', async () => {
      renderScreen(backend, <SettingsScreen />);
      const microphone = await screen.findByRole('combobox', { name: 'Microphone' });
      const meeting = screen.getByRole('combobox', { name: 'Meeting app' }) as HTMLSelectElement;
      expect((microphone as HTMLSelectElement).disabled).toBe(false);
      expect(meeting.disabled).toBe(false);
      const original = (await backend.call('getSettings')).audio;
      const alternate = Array.from(meeting.options).find(
        (option) => option.value !== original.meetingAppId,
      );
      expect(alternate).toBeTruthy();
      fireEvent.change(meeting, { target: { value: alternate!.value } });
      expect(await saveBar()).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await vi.waitFor(() => expect(screen.queryByText('You have unsaved changes.')).toBeNull());
      const updated = (await backend.call('getSettings')).audio;
      expect(updated.meetingAppId).toBe(alternate!.value);
      expect(updated.preset).toBe(original.preset);
      expect(updated.noiseSuppression).toBe(original.noiseSuppression);
    });

    it('saves a draft and clears the unsaved state', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: 'Performance' }), {
        target: { value: 'accurate' },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      await vi.waitFor(() => expect(screen.queryByText('You have unsaved changes.')).toBeNull());
      expect((await backend.call('getSettings')).transcriptionQuality).toBe('accurate');
    });

    it('discards a draft without saving', async () => {
      renderScreen(backend, <SettingsScreen />);
      const quality = await screen.findByRole('combobox', { name: 'Performance' });
      fireEvent.change(quality, { target: { value: 'fast' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
      expect((quality as HTMLSelectElement).value).toBe('balanced');
      expect((await backend.call('getSettings')).transcriptionQuality).toBe('balanced');
    });

    it('keeps an unsaved draft after leaving the screen', async () => {
      const first = renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: 'Performance' }), {
        target: { value: 'fast' },
      });
      first.unmount();
      renderScreen(backend, <SettingsScreen />);
      expect(await saveBar()).toBeTruthy();
      const quality = screen.getByRole('combobox', { name: 'Performance' });
      expect((quality as HTMLSelectElement).value).toBe('fast');
    });

    it('holds one loading state, then the form, while devices are slow to list', async () => {
      forgetSources();
      const real = backend.call.bind(backend);
      let release!: () => void;
      const gate = new Promise<void>((done) => (release = done));
      vi.spyOn(backend, 'call').mockImplementation(((name: string, ...args: unknown[]) =>
        name === 'listInputDevices'
          ? gate.then(() => (real as (n: string, ...a: unknown[]) => unknown)(name, ...args))
          : (real as (n: string, ...a: unknown[]) => unknown)(name, ...args)) as never);
      renderScreen(backend, <SettingsScreen />);
      expect(screen.getByRole('status').textContent).toBe('Loading…');
      expect(screen.queryByRole('combobox', { name: 'Performance' })).toBeNull();
      release();
      expect(await screen.findByRole('combobox', { name: 'Performance' })).toBeTruthy();
    });

    it('asks before turning on auto-delete', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: /Auto-delete/ }), {
        target: { value: '90d' },
      });
      const scope = screen.getByRole('combobox', { name: 'What to delete' });
      expect(
        within(scope)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Audio', 'Whole meeting']);
      fireEvent.change(scope, { target: { value: 'wholeMeeting' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toContain(
        'Meetings older than 90 days will be permanently deleted: the audio, the transcript, the summary and the exports.',
      );
      expect((await backend.call('getSettings')).autoDelete.period).toBe('never');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save and turn on' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect((await backend.call('getSettings')).autoDelete).toEqual({
        period: '90d',
        scope: 'wholeMeeting',
      });
    });

    it('describes exactly what the selected delete option removes', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: /Auto-delete/ }), {
        target: { value: '30d' },
      });
      const scope = screen.getByRole('combobox', { name: 'What to delete' });
      expect(screen.getByText(/older than 30 days/).textContent).toBe(
        'The audio of meetings older than 30 days will be permanently deleted. Transcripts and summaries stay.',
      );
      fireEvent.change(scope, { target: { value: 'wholeMeeting' } });
      expect(screen.getByText(/older than 30 days/).textContent).toBe(
        'Meetings older than 30 days will be permanently deleted: the audio, the transcript, the summary and the exports.',
      );
    });

    it('warns under a listed state', async () => {
      renderScreen(backend, <SettingsScreen />);
      await chooseOption('Country', 'United States');
      await chooseOption('State', 'Washington');
      expect(screen.getByText(/Washington has a biometric-privacy law/)).toBeTruthy();
    });

    it.each(['mock', 'hybrid'] as const)(
      'does not expose fake model actions or library relocation in %s mode',
      async (mode) => {
        const source = mode === 'hybrid' ? createHybridBackend(backend, backend) : backend;
        const original = await backend.call('getSettings');
        renderScreen(source, <SettingsScreen />);

        expect(
          await screen.findByText(/Model updates and rollback are not available yet/),
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Check for model updates' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Install update/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Revert .* previous model/ })).toBeNull();
        expect(screen.queryByText(/Version mock-2 is available/)).toBeNull();

        const location = screen.getByRole('button', { name: 'Change location…' });
        expect((location as HTMLButtonElement).disabled).toBe(true);
        expect(location.getAttribute('aria-describedby')).toBe('settings-storage-move-help');
        expect(screen.getByText(/Moving a saved library is not available yet/)).toBeTruthy();
        expect(screen.getByText(original.storageLocation)).toBeTruthy();
        expect(screen.queryByText('You have unsaved changes.')).toBeNull();

        // Unrelated functional controls remain interactive.
        expect(
          (
            screen.getByRole('combobox', {
              name: 'Auto-delete meetings after',
            }) as HTMLSelectElement
          ).disabled,
        ).toBe(false);
        expect(screen.getByRole('combobox', { name: 'Microphone' })).toBeTruthy();
      },
    );
  });
});
