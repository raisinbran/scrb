import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError } from '@scrb/contracts';
import { SpeakerSuggestionsProvider } from '../../components/speakers/SpeakerSuggestions.tsx';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { PlaybackProvider, useMeetingPlayback } from '../../lib/playback-context.tsx';
import { MockBackend } from '../../mocks/index.ts';
import { ThemeProvider } from '../../theme/ThemeProvider.tsx';
import { SpeakersScreen } from '../SpeakersScreen.tsx';

class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  preload = '';
  currentTime = 0;
  paused = true;
  listeners = new Map<string, () => void>();
  constructor() {
    FakeAudio.all.push(this);
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
  load() {}
}

describe('Split a speaker: passage preview', () => {
  let backend: MockBackend;

  beforeEach(() => {
    window.localStorage.clear();
    FakeAudio.all = [];
    backend = new MockBackend();
    vi.stubGlobal('Audio', FakeAudio);
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
    vi.restoreAllMocks();
  });

  function Probe() {
    const playback = useMeetingPlayback('meeting-outdated');
    return <button onClick={() => playback.play(0)}>Play meeting</button>;
  }

  async function openDialog() {
    render(
      <BackendProvider backend={backend}>
        <ThemeProvider>
          <SpeakerSuggestionsProvider>
            <PlaybackProvider>
              <Probe />
              <SpeakersScreen />
            </PlaybackProvider>
          </SpeakerSuggestionsProvider>
        </ThemeProvider>
      </BackendProvider>,
    );
    const picker = await screen.findByRole('combobox', { name: 'Meeting' });
    fireEvent.change(picker, { target: { value: 'meeting-outdated' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Split a speaker…' }));
    return within(screen.getByRole('dialog'));
  }

  const withChunk = () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
      name === 'getPlaybackMedia'
        ? Promise.resolve({
            chunks: [{ track: 'meeting', startMs: 0, endMs: 600000, url: 'scribe-media://m/0' }],
            nextPositionMs: null,
          })
        : real(name, request)) as typeof backend.call);
  };

  it('plays a passage, then stops it with the same button', async () => {
    withChunk();
    const dialog = await openDialog();
    const play = (
      await dialog.findAllByRole('button', { name: /^Play passage at/ })
    )[0] as HTMLElement;
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(play);
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    fireEvent.click(await dialog.findByRole('button', { name: /^Stop passage at/ }));
    expect(FakeAudio.all[0]?.paused).toBe(true);
    await dialog.findAllByRole('button', { name: /^Play passage at/ });
  });

  it('stops when the dialog closes', async () => {
    withChunk();
    const dialog = await openDialog();
    const play = (
      await dialog.findAllByRole('button', { name: /^Play passage at/ })
    )[0] as HTMLElement;
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(play);
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(FakeAudio.all[0]?.paused).toBe(true);
  });

  it('stops at the end of the passage on the audio clock', async () => {
    withChunk();
    const dialog = await openDialog();
    const transcript = await backend.call('getTranscript', {
      meetingId: 'meeting-outdated',
      offset: 0,
      limit: 500,
    });
    const first = transcript.segments.find(
      (segment) => segment.speakerId === transcript.speakers[0]?.id,
    );
    const play = (
      await dialog.findAllByRole('button', { name: /^Play passage at/ })
    )[0] as HTMLElement;
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(play);
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    const audio = FakeAudio.all[0] as FakeAudio;
    audio.currentTime = ((first?.endMs ?? 0) + 100) / 1000;
    audio.listeners.get('timeupdate')?.();
    await waitFor(() => expect(audio.paused).toBe(true));
    await dialog.findAllByRole('button', { name: /^Play passage at/ });
  });

  it('disables the buttons and says why when the audio is gone', async () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
      name === 'getMeeting'
        ? real(name, request).then((meeting) => ({ ...(meeting as object), hasAudio: false }))
        : real(name, request)) as typeof backend.call);
    const dialog = await openDialog();
    expect(await dialog.findByText(/Audio isn.t saved for this meeting/)).toBeTruthy();
    const buttons = dialog.getAllByRole('button', {
      name: /^Play passage at/,
    }) as HTMLButtonElement[];
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it('shows a message when no audio comes back for the passage', async () => {
    const dialog = await openDialog();
    const play = (
      await dialog.findAllByRole('button', { name: /^Play passage at/ })
    )[0] as HTMLElement;
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(play);
    expect((await dialog.findByRole('alert')).textContent).toMatch(/isn.t available/);
  });

  it('never sounds together with the shared playback', async () => {
    withChunk();
    const dialog = await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Play meeting' }));
    await waitFor(() => expect(FakeAudio.all.some((audio) => !audio.paused)).toBe(true));
    const shared = FakeAudio.all[0] as FakeAudio;
    const play = (
      await dialog.findAllByRole('button', { name: /^Play passage at/ })
    )[0] as HTMLElement;
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(play);
    await waitFor(() => expect(FakeAudio.all.length).toBeGreaterThan(1));
    await waitFor(() => expect(shared.paused).toBe(true));
    const clip = FakeAudio.all.at(-1) as FakeAudio;
    expect(clip.paused).toBe(false);
    // The clip's own events must not restart the shared audio.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(FakeAudio.all.filter((audio) => !audio.paused)).toEqual([clip]);
    fireEvent.click(screen.getByRole('button', { name: 'Play meeting' }));
    await waitFor(() => expect(clip.paused).toBe(true));
    await dialog.findAllByRole('button', { name: /^Play passage at/ });
  });

  it('moves the other passages and lists the ones refused for overlap', async () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    let moves = 0;
    const calls: string[] = [];
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) => {
      if (name === 'splitSpeaker' || name === 'reassignSpeaker') {
        calls.push(name);
        if (++moves === 2) {
          return Promise.reject(
            new ContractError({ code: 'conflict', message: 'These words overlap other speech.' }),
          );
        }
      }
      return real(name, request);
    }) as typeof backend.call);
    const dialog = await openDialog();
    const boxes = await dialog.findAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (const box of boxes.slice(0, 3)) fireEvent.click(box);
    fireEvent.change(dialog.getByLabelText('New speaker name'), { target: { value: 'Invented' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Split' }));
    expect(
      await dialog.findByText(/1 passage could not be moved because it overlaps/),
    ).toBeTruthy();
    expect(calls).toEqual(['splitSpeaker', 'reassignSpeaker', 'reassignSpeaker']);
    // A second click closes; nothing is retried.
    fireEvent.click(dialog.getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.length).toBe(3);
  });
});
