import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Speaker } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockBackend } from '../mocks/index.ts';
import { MOCK_SPEAKERS } from '../mocks/transcript.ts';
import { FirstLaunchLocation } from './FirstLaunchLocation.tsx';
import { LocationField } from './LocationField.tsx';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { SpeakerLabel } from './speakers/SpeakerLabel.tsx';

function wrap(backend: MockBackend, children: ReactNode) {
  return render(<BackendProvider backend={backend}>{children}</BackendProvider>);
}

const MEETING = 'meeting-outdated';

function renderLabel(backend: MockBackend, speaker: Speaker, withRange = false) {
  return wrap(
    backend,
    <SpeakerLabel
      meetingId={MEETING}
      speaker={speaker}
      speakers={MOCK_SPEAKERS}
      {...(withRange
        ? {
            range: {
              firstWordId: `${MEETING}-seg-0-w-0`,
              lastWordId: `${MEETING}-seg-1-w-0`,
            },
          }
        : {})}
    />,
  );
}

const speakerNames = async (backend: MockBackend) => {
  const page = await backend.call('getTranscript', { meetingId: MEETING, offset: 0, limit: 5 });
  return page.speakers.map((speaker) => speaker.label);
};

describe('shared components', () => {
  let backend: MockBackend;

  beforeEach(() => {
    window.localStorage.clear();
    backend = new MockBackend();
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
  });

  describe('SpeakerLabel', () => {
    const unknown = MOCK_SPEAKERS[2] as Speaker;

    it('offers reassign and split only with a selection', () => {
      renderLabel(backend, unknown);
      fireEvent.click(screen.getByRole('button', { name: 'Speaker: Speaker 2' }));
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Rename…',
        'Merge into…',
      ]);
    });

    it('moves through the menu by keyboard and returns focus on Escape', () => {
      renderLabel(backend, unknown, true);
      const trigger = screen.getByRole('button', { name: 'Speaker: Speaker 2' });
      fireEvent.click(trigger);
      const items = screen.getAllByRole('menuitem');
      expect(document.activeElement).toBe(items[0]);
      fireEvent.keyDown(items[0] as HTMLElement, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(items[3]);
      fireEvent.keyDown(items[3] as HTMLElement, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it('renames a meeting speaker', async () => {
      renderLabel(backend, unknown);
      fireEvent.click(screen.getByRole('button', { name: 'Speaker: Speaker 2' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Ana Ferreira' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(await speakerNames(backend)).toContain('Ana Ferreira');
    });

    it('merges a speaker and moves its text', async () => {
      renderLabel(backend, unknown);
      fireEvent.click(screen.getByRole('button', { name: 'Speaker: Speaker 2' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into…' }));
      fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const page = await backend.call('getTranscript', {
        meetingId: MEETING,
        offset: 0,
        limit: 1000,
      });
      expect(page.speakers.some((speaker) => speaker.id === unknown.id)).toBe(false);
      expect(page.segments.some((segment) => segment.speakerId === unknown.id)).toBe(false);
    });

    it('splits a selection into a new speaker', async () => {
      await backend.call('getTranscript', { meetingId: MEETING, offset: 0, limit: 1 });
      renderLabel(backend, unknown, true);
      fireEvent.click(screen.getByRole('button', { name: 'Speaker: Speaker 2' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Split selection…' }));
      const dialog = within(screen.getByRole('dialog'));
      expect((dialog.getByRole('button', { name: 'Split' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'Ben Okafor' } });
      fireEvent.click(dialog.getByRole('button', { name: 'Split' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(await speakerNames(backend)).toContain('Ben Okafor');
    });

    it('keeps the dialog open and shows why when the call fails', async () => {
      vi.spyOn(backend, 'call').mockRejectedValueOnce(new Error('Could not rename.'));
      renderLabel(backend, unknown);
      fireEvent.click(screen.getByRole('button', { name: 'Speaker: Speaker 2' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ana' } });
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      expect((await screen.findByRole('alert')).textContent).toBe('Could not rename.');
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  describe('PrivacyBanner', () => {
    const recordingState = (meetingId: string, required = true) =>
      act(() =>
        backend.emit('recordingStateChanged', {
          status: 'recording',
          meetingId,
          elapsedMs: 0,
          pauseReason: null,
          privacyBannerRequired: required,
        }),
      );

    // The hook's snapshot call must land first, or its idle state overwrites the event.
    const renderBanner = () =>
      act(async () => {
        wrap(backend, <PrivacyBanner />);
        await backend.call('getRecordingSnapshot');
      });

    it('stays hidden when the backend does not require it', async () => {
      await renderBanner();
      recordingState('m1', false);
      expect(screen.queryByText(/Voice profiles are being built/)).toBeNull();
    });

    it('can be dismissed, and returns at the next recording', async () => {
      await renderBanner();
      recordingState('m1');
      fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText(/Voice profiles are being built/)).toBeNull();
      recordingState('m2');
      expect(await screen.findByText(/Voice profiles are being built/)).toBeTruthy();
    });
  });

  describe('LocationField', () => {
    it('warns directly under a listed state and not under others', () => {
      const location = { country: 'US', usState: 'IL' };
      const { rerender } = wrap(
        backend,
        <LocationField value={location} onChange={() => undefined} />,
      );
      expect(screen.getByRole('status').textContent).toContain('Illinois');
      rerender(
        <BackendProvider backend={backend}>
          <LocationField value={{ country: 'US', usState: 'NY' }} onChange={() => undefined} />
        </BackendProvider>,
      );
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('reports a chosen state with its country', () => {
      const onChange = vi.fn();
      wrap(backend, <LocationField value={{ country: null, usState: null }} onChange={onChange} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'TX' } });
      expect(onChange).toHaveBeenCalledWith({ country: 'US', usState: 'TX' });
    });
  });

  describe('FirstLaunchLocation', () => {
    it('stays closed once a location is set', async () => {
      wrap(backend, <FirstLaunchLocation onAnswered={() => undefined} />);
      await backend.call('getSetupStatus');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('requires an answer, then saves it', async () => {
      await backend.call('updateSettings', { location: { country: null, usState: null } });
      const onAnswered = vi.fn();
      wrap(backend, <FirstLaunchLocation onAnswered={onAnswered} />);
      const dialog = await screen.findByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeTruthy();
      const next = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
      expect(next.disabled).toBe(true);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'IL' } });
      fireEvent.click(next);
      await vi.waitFor(() => expect(onAnswered).toHaveBeenCalled());
      const settings = await backend.call('getSettings');
      expect(settings.location).toEqual({ country: 'US', usState: 'IL' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
