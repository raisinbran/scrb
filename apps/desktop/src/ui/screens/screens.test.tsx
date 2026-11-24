import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    it('shows the empty state', async () => {
      backend.setProfiles([]);
      renderScreen(backend, <SpeakersScreen />);
      expect(await screen.findByText('No voice profiles yet')).toBeTruthy();
    });

    it('explains when there are no meetings to edit while keeping the meeting card', async () => {
      backend.setLibrary([]);
      renderScreen(backend, <SpeakersScreen />);
      const column = await screen.findByTestId('meeting-speakers-column');
      expect(within(column).getByRole('heading', { name: 'Speakers in a meeting' })).toBeTruthy();
      expect(
        within(column).getByText('No meetings are currently available for speaker editing.'),
      ).toBeTruthy();
    });

    it('uses the standard centered empty state inside the profile column', async () => {
      backend.setProfiles([]);
      renderScreen(backend, <SpeakersScreen />);
      const empty = (await screen.findByText('No voice profiles yet')).parentElement;
      expect(empty?.className).toMatch(/empty/);
      expect(empty?.className).not.toMatch(/emptyCompact/);
      expect(empty?.closest('[data-testid="voice-profile-column"]')).toBeTruthy();
      const css = readFileSync(join(__dirname, 'Screen.module.css'), 'utf8');
      expect(css.match(/\.empty \{([^}]*)\}/)?.[1]).toMatch(/text-align: center/);
      expect(css.match(/\.empty \{([^}]*)\}/)?.[1]).toMatch(/--space-7/);
      expect(readFileSync(join(__dirname, 'SpeakersScreen.module.css'), 'utf8')).not.toMatch(
        /\.empty\b/,
      );
    });

    it('keeps profile suggestions and meeting controls in separate columns', async () => {
      renderScreen(backend, <SpeakersScreen />);
      await screen.findByText('Voice profiles');
      backend.emit('speakerSuggestion', {
        meetingId: 'meeting-outdated',
        speakerId: 'sp-3',
        profileId: 'profile-2',
        profileName: 'Tomas Lindgren',
      });
      await screen.findByRole('heading', { name: 'Suggested matches' });
      const left = screen.getByTestId('voice-profile-column');
      const right = screen.getByTestId('meeting-speakers-column');
      expect(left.contains(screen.getByRole('heading', { name: 'Suggested matches' }))).toBe(true);
      expect(left.contains(screen.getByText('Voice profiles'))).toBe(true);
      expect(right.contains(screen.getByRole('heading', { name: 'Speakers in a meeting' }))).toBe(
        true,
      );
      expect(right.contains(screen.getByRole('combobox', { name: 'Meeting' }))).toBe(true);
    });

    it('renames a profile', async () => {
      renderScreen(backend, <SpeakersScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Rename Unnamed voice' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Mina Sato' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      expect(await screen.findByText('Mina Sato')).toBeTruthy();
    });

    it('merges two profiles and adds their meetings', async () => {
      renderScreen(backend, <SpeakersScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Merge Tomas Lindgren' }));
      fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
      await vi.waitFor(() => expect(screen.queryByText('Tomas Lindgren')).toBeNull());
      expect(await screen.findByText(/23 meetings/)).toBeTruthy();
    });

    it('shows a deleting row, then removes the profile', async () => {
      renderScreen(backend, <SpeakersScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Tomas Lindgren' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
      expect(await screen.findByText('Deleting…')).toBeTruthy();
      await vi.waitFor(() => expect(screen.queryByText('Tomas Lindgren')).toBeNull(), {
        timeout: 2000,
      });
    });

    it('keeps the profile and says so when delete fails', async () => {
      backend.arm('profileDeleteFails');
      renderScreen(backend, <SpeakersScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Tomas Lindgren' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
      expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toContain(
        'could not be deleted',
      );
      expect(screen.getByText('Tomas Lindgren')).toBeTruthy();
    });

    it('confirms a suggested match', async () => {
      renderScreen(backend, <SpeakersScreen />);
      await screen.findByText('Voice profiles');
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

    it('splits part of a speaker in a chosen meeting', async () => {
      renderScreen(backend, <SpeakersScreen />);
      const picker = await screen.findByRole('combobox', { name: 'Meeting' });
      fireEvent.change(picker, { target: { value: 'meeting-outdated' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Split a speaker…' }));
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.change(dialog.getByRole('textbox', { name: 'New speaker name' }), {
        target: { value: 'Ben Okafor' },
      });
      const lines = dialog.getAllByRole('checkbox');
      fireEvent.click(lines[0] as HTMLElement);
      fireEvent.click(lines[1] as HTMLElement);
      fireEvent.click(dialog.getByRole('button', { name: 'Split' }));
      expect(await screen.findByRole('button', { name: 'Speaker: Ben Okafor' })).toBeTruthy();
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
  });

  describe('Vocabulary', () => {
    it('focuses the heading after deleting a term', async () => {
      renderScreen(backend, <VocabularyScreen />);
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

    it('says how many terms are enabled and that only about 40 are used', async () => {
      renderScreen(backend, <VocabularyScreen />);
      const terms = await backend.call('listTerms');
      const enabled = terms.filter((term) => term.enabled).length;
      expect(await screen.findByText(`${enabled} enabled, up to 40 used.`)).toBeTruthy();
      expect(screen.getByText(/at most 512 characters/)).toBeTruthy();
      expect(screen.getByText(/Disabling terms you do not need frees room/)).toBeTruthy();
    });

    it('lists suggested terms with their counts and their misheard forms', async () => {
      renderScreen(backend, <VocabularyScreen />);
      expect(await screen.findByRole('heading', { name: 'Suggested terms' })).toBeTruthy();
      expect(screen.getByText('4 corrections in 3 meetings')).toBeTruthy();
      expect(screen.getByText('2 corrections in 2 meetings')).toBeTruthy();
    });

    it('remembers a suggestion and refreshes both lists', async () => {
      renderScreen(backend, <VocabularyScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Remember Marlow Quay' }));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Remember Marlow Quay' })).toBeNull(),
      );
      expect(await screen.findByRole('button', { name: 'Edit Marlow Quay' })).toBeTruthy();
    });

    it('dismisses a suggestion without adding a term', async () => {
      renderScreen(backend, <VocabularyScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Tessel' }));
      await waitFor(() => expect(screen.queryByText('Tessel')).toBeNull());
      expect((await backend.call('listTerms')).some((term) => term.term === 'Tessel')).toBe(false);
    });

    it('shows an error and refreshes when a suggestion changed', async () => {
      renderScreen(backend, <VocabularyScreen />);
      const remember = await screen.findByRole('button', { name: 'Remember Tessel' });
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-2', accepted: false });
      fireEvent.click(remember);
      expect((await screen.findByRole('alert')).textContent).toBe('That suggestion changed.');
      await waitFor(() => expect(screen.queryByText('Tessel')).toBeNull());
    });

    it('hides the section when there are no suggestions', async () => {
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-1', accepted: false });
      await backend.call('answerVocabularySuggestion', { id: 'suggestion-2', accepted: false });
      renderScreen(backend, <VocabularyScreen />);
      await screen.findByText('Kestrel API');
      expect(screen.queryByRole('heading', { name: 'Suggested terms' })).toBeNull();
    });

    it('shows the empty state', async () => {
      backend.setTerms([]);
      renderScreen(backend, <VocabularyScreen />);
      expect(await screen.findByText('No terms yet')).toBeTruthy();
    });

    it('marks a disabled entry and enables it', async () => {
      renderScreen(backend, <VocabularyScreen />);
      expect(await screen.findByText('Disabled')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Enable Q-Track' }));
      await vi.waitFor(() => expect(screen.queryByText('Disabled')).toBeNull());
      const terms = await backend.call('listTerms');
      expect(terms.find((term) => term.id === 'term-3')?.history.at(-1)?.action).toBe('enabled');
    });

    it('edits spelling and misheard versions', async () => {
      renderScreen(backend, <VocabularyScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Kestrel API' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Correct spelling' }), {
        target: { value: 'Kestrel Gateway' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /Misheard/ }), {
        target: { value: 'castrol api\n  kessel gateway  \n\ncastrol api' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Kestrel Gateway')).toBeTruthy();
      const term = (await backend.call('listTerms')).find((item) => item.id === 'term-2');
      expect(term?.misheard).toEqual(['castrol api', 'kessel gateway']);
    });

    it('deletes a term after confirming', async () => {
      renderScreen(backend, <VocabularyScreen />);
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

    it('shows stored presets as unavailable without creating unsaved changes', async () => {
      const original = (await backend.call('getSettings')).audio;
      renderScreen(backend, <SettingsScreen />);
      expect(
        await screen.findByText(
          /Audio processing profiles, noise suppression, gain, sensitivity and advanced detection/,
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
      fireEvent.change(await screen.findByRole('combobox', { name: /State where you live/ }), {
        target: { value: 'WA' },
      });
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
