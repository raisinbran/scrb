import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeakerSuggestionsProvider } from '../../components/speakers/SpeakerSuggestions.tsx';
import { stopClipPlayback } from '../../lib/clip-player.ts';
import { PlaybackProvider, useMeetingPlayback } from '../../lib/playback-context.tsx';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { MockBackend } from '../../mocks/index.ts';
import { ThemeProvider } from '../../theme/ThemeProvider.tsx';
import { SpeakersScreen } from '../SpeakersScreen.tsx';

class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  preload = '';
  currentTime = 0;
  volume = 1;
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

describe('Voice profile sample', () => {
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

  const withAudio = () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
      name === 'getPlaybackMedia'
        ? Promise.resolve({
            chunks: ['meeting', 'microphone'].map((track) => ({
              track,
              startMs: 0,
              endMs: 3_600_000,
              url: `scribe-media://m/${track}`,
            })),
            nextPositionMs: null,
          })
        : real(name, request)) as typeof backend.call);
  };

  const open = async () => {
    render(
      <BackendProvider backend={backend}>
        <ThemeProvider>
          <SpeakerSuggestionsProvider>
            <SpeakersScreen />
          </SpeakerSuggestionsProvider>
        </ThemeProvider>
      </BackendProvider>,
    );
    return screen.findByRole('button', { name: 'Play sample of Priya Natarajan' });
  };

  it('lists the clips and plays only the track they were spoken on', async () => {
    withAudio();
    fireEvent.click(await open());
    const list = await screen.findByRole('list', { name: 'Samples of Priya Natarajan' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeAudio.all).toHaveLength(1));
    expect(FakeAudio.all[0]?.paused).toBe(false);
    expect(FakeAudio.all[0]?.src).toMatch(/\/(meeting|microphone)$/);
  });

  it('stops with the same button and on leaving the screen', async () => {
    withAudio();
    fireEvent.click(await open());
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Stop sample of Priya Natarajan' }));
    expect(FakeAudio.all[0]?.paused).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play sample of Priya Natarajan' }));
    await waitFor(() => expect(FakeAudio.all.some((audio) => !audio.paused)).toBe(true));
    cleanup();
    expect(FakeAudio.all.every((audio) => audio.paused)).toBe(true);
  });

  it('moves on to the next clip when one ends on the audio clock', async () => {
    withAudio();
    const { clips } = await backend.call('getProfileClips', { profileId: 'profile-1' });
    expect(clips.length).toBeGreaterThan(1);
    fireEvent.click(await open());
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    const first = FakeAudio.all[0] as FakeAudio;
    first.currentTime = 3_000;
    first.listeners.get('timeupdate')?.();
    expect(first.paused).toBe(true);
    await waitFor(() => expect(FakeAudio.all).toHaveLength(2));
    expect(FakeAudio.all[1]?.paused).toBe(false);
  });

  it('stops when another preview or the shared playback takes over, and uses the app volume', async () => {
    window.localStorage.setItem('scrb.playback.volume', '0.3');
    window.localStorage.setItem('scrb.playback.muted', 'false');
    withAudio();
    fireEvent.click(await open());
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    expect(FakeAudio.all[0]?.volume).toBe(0.3);
    stopClipPlayback();
    expect(FakeAudio.all[0]?.paused).toBe(true);
    await screen.findByRole('button', { name: 'Play sample of Priya Natarajan' });
    expect(FakeAudio.all).toHaveLength(1);
  });

  it('says so when no clip qualifies', async () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
      name === 'getProfileClips'
        ? Promise.resolve({ clips: [] })
        : real(name, request)) as typeof backend.call);
    fireEvent.click(await open());
    expect((await screen.findByRole('status')).textContent).toBe('No audio available to preview.');
  });

  it('says so when the saved audio cannot be played', async () => {
    fireEvent.click(await open());
    expect((await screen.findByRole('status')).textContent).toMatch(/isn.t available/);
  });

  it('starts exactly at the passage, with no lead-in that could hold another voice', async () => {
    withAudio();
    const { clips } = await backend.call('getProfileClips', { profileId: 'profile-1' });
    fireEvent.click(await open());
    await waitFor(() => expect(FakeAudio.all[0]?.paused).toBe(false));
    expect(FakeAudio.all[0]?.currentTime).toBeCloseTo((clips[0]?.startMs ?? 0) / 1000);
  });

  it('lets the latest selection win when an earlier request finishes late', async () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    withAudio();
    const inner = vi.mocked(backend.call).getMockImplementation() as (
      name: string,
      request: unknown,
    ) => Promise<unknown>;
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
      name === 'getProfileClips' && (request as { profileId: string }).profileId === 'profile-1'
        ? slow.then(() => real(name, request))
        : name === 'getProfileClips'
          ? real(name, { profileId: 'profile-1' })
          : inner(name, request)) as typeof backend.call);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Play sample of Priya Natarajan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play sample of Tomas Lindgren' }));
    await waitFor(() => expect(FakeAudio.all.some((audio) => !audio.paused)).toBe(true));
    const playing = FakeAudio.all.filter((audio) => !audio.paused);
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(FakeAudio.all.filter((audio) => !audio.paused)).toEqual(playing);
    expect(screen.queryByRole('list', { name: 'Samples of Priya Natarajan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop sample of Tomas Lindgren' })).toBeTruthy();
  });

  it('does nothing when the screen is left before the request finishes', async () => {
    const real = backend.call.bind(backend) as (name: string, request: unknown) => Promise<unknown>;
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(backend, 'call').mockImplementation(((name: string, request: unknown) =>
      name === 'getProfileClips'
        ? slow.then(() => real(name, request))
        : real(name, request)) as typeof backend.call);
    function Probe() {
      useMeetingPlayback('meeting-outdated');
      return null;
    }
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
    fireEvent.click(await screen.findByRole('button', { name: 'Play sample of Priya Natarajan' }));
    cleanup();
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const names = vi.mocked(backend.call).mock.calls.map((call) => call[0]);
    expect(FakeAudio.all).toHaveLength(0);
    // A stale request must not pause the app's other playback either.
    expect(names).not.toContain('pauseAudio');
    expect(names).not.toContain('seekAudio');
  });
});
