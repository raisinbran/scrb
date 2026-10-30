import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SpeakerSuggestionsProvider } from '../components/speakers/SpeakerSuggestions.tsx';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockBackend } from '../mocks/index.ts';
import { ThemeProvider } from '../theme/ThemeProvider.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { SpeakersScreen } from './SpeakersScreen.tsx';
import { VocabularyScreen } from './VocabularyScreen.tsx';

function renderScreen(backend: MockBackend, node: ReactNode) {
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
    it('applies Studio to the controls and marks the draft unsaved', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('radio', { name: /^Studio/ }));
      expect(await saveBar()).toBeTruthy();
      const noise = screen.getByRole('combobox', { name: 'Noise suppression' });
      expect((noise as HTMLSelectElement).value).toBe('off');
      const echo = screen.getByRole('checkbox', { name: /Echo cancellation/ });
      expect((echo as HTMLInputElement).checked).toBe(false);
    });

    it('switches to Custom when a preset control changes', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('checkbox', { name: /Echo cancellation/ }));
      const custom = screen.getByRole('radio', { name: /^Custom/ }) as HTMLInputElement;
      expect(custom.checked).toBe(true);
    });

    it('keeps the preset when an unrelated toggle changes', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('checkbox', { name: /No audio detected/ }));
      const voice = screen.getByRole('radio', { name: /^Voice Isolation/ }) as HTMLInputElement;
      expect(voice.checked).toBe(true);
    });

    it('saves a draft and clears the unsaved state', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: 'Transcription quality' }), {
        target: { value: 'accurate' },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      await vi.waitFor(() => expect(screen.queryByText('You have unsaved changes.')).toBeNull());
      expect((await backend.call('getSettings')).transcriptionQuality).toBe('accurate');
    });

    it('discards a draft without saving', async () => {
      renderScreen(backend, <SettingsScreen />);
      const quality = await screen.findByRole('combobox', { name: 'Transcription quality' });
      fireEvent.change(quality, { target: { value: 'fast' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
      expect((quality as HTMLSelectElement).value).toBe('balanced');
      expect((await backend.call('getSettings')).transcriptionQuality).toBe('balanced');
    });

    it('keeps an unsaved draft after leaving the screen', async () => {
      const first = renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: 'Transcription quality' }), {
        target: { value: 'fast' },
      });
      first.unmount();
      renderScreen(backend, <SettingsScreen />);
      expect(await saveBar()).toBeTruthy();
      const quality = screen.getByRole('combobox', { name: 'Transcription quality' });
      expect((quality as HTMLSelectElement).value).toBe('fast');
    });

    it('asks before turning on auto-delete', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: /Auto-delete/ }), {
        target: { value: '90d' },
      });
      fireEvent.change(screen.getByRole('combobox', { name: 'What to delete' }), {
        target: { value: 'wholeMeeting' },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toContain('Meetings older than 90 days');
      expect((await backend.call('getSettings')).autoDelete.period).toBe('never');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save and turn on' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect((await backend.call('getSettings')).autoDelete).toEqual({
        period: '90d',
        scope: 'wholeMeeting',
      });
    });

    it('warns under a listed state', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.change(await screen.findByRole('combobox', { name: /State where you live/ }), {
        target: { value: 'WA' },
      });
      expect(screen.getByText(/Washington has a biometric-privacy law/)).toBeTruthy();
    });

    it('shows an available model update, its progress and the finished version', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Check for model updates' }));
      expect(await screen.findByText(/Version mock-2 is available/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Install update for Final speech' }));
      expect(await screen.findByText(/Downloading .*30%/)).toBeTruthy();
      expect(await screen.findByText(/version mock-2/, {}, { timeout: 4000 })).toBeTruthy();
    });

    it('shows a failed model download', async () => {
      backend.arm('modelDownloadFails');
      renderScreen(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Check for model updates' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Install update for Final speech' }),
      );
      expect((await screen.findByRole('alert')).textContent).toContain('download stopped');
    });

    it('updates the storage location at once', async () => {
      renderScreen(backend, <SettingsScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Change location…' }));
      expect(await screen.findByText('/Users/example/Documents/Meeting Scribe')).toBeTruthy();
      expect(screen.queryByText('You have unsaved changes.')).toBeNull();
    });
  });
});
