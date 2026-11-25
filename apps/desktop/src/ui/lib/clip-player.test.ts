import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from '@scrb/contracts';
import { ClipPlayer, stopClipPlayback } from './clip-player.ts';
import type { AudioOutput } from './playback-engine.ts';

class FakeAudio {
  src = '';
  preload = '';
  currentTime = 0;
  paused = true;
  volume = 1;
  muted = false;
  listeners = new Map<string, () => void>();
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

function setup(
  chunks: Array<{ track: 'microphone' | 'meeting'; startMs: number; endMs: number; url: string }>,
) {
  const calls: string[] = [];
  const backend = {
    call: vi.fn((name: string) => {
      calls.push(name);
      return Promise.resolve(
        name === 'getPlaybackMedia' ? { chunks, nextPositionMs: null } : undefined,
      );
    }),
  } as unknown as Backend;
  const audios: FakeAudio[] = [];
  const ends: Array<string | null> = [];
  const player = new ClipPlayer(
    backend,
    (error) => ends.push(error),
    () => {
      const audio = new FakeAudio();
      audios.push(audio);
      return audio as unknown as AudioOutput;
    },
  );
  return { player, audios, ends, calls, backend };
}

const meeting = { track: 'meeting' as const, startMs: 0, endMs: 60000, url: 'scribe-media://m/0' };

describe('ClipPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("waits for the previous clip's pause to be answered before seeking again", async () => {
    const { player, calls, backend } = setup([meeting]);
    await player.play('m1', 10_000, 12_000);
    let answer: () => void = () => undefined;
    const slow = vi.mocked(backend.call).getMockImplementation() as (
      name: string,
    ) => Promise<unknown>;
    vi.mocked(backend.call).mockImplementation(((name: string) =>
      name === 'pauseAudio'
        ? new Promise<void>((resolve) => {
            calls.push(name);
            answer = resolve;
          })
        : slow(name)) as never);
    player.stop();
    const next = player.play('m1', 20_000, 22_000);
    await Promise.resolve();
    expect(calls.filter((name) => name === 'seekAudio')).toHaveLength(1);
    answer();
    await next;
    expect(calls.filter((name) => name === 'seekAudio')).toHaveLength(2);
    expect(calls.lastIndexOf('pauseAudio')).toBeLessThan(calls.lastIndexOf('seekAudio'));
    player.stop();
    answer();
  });

  it('starts half a second early and stops when the element clock passes the end', async () => {
    const { player, audios, ends } = setup([meeting]);
    await player.play('m1', 10_000, 12_000);
    const audio = audios[0] as FakeAudio;
    expect(audio.currentTime).toBeCloseTo(9.5);
    expect(audio.paused).toBe(false);
    audio.currentTime = 11.9;
    vi.advanceTimersByTime(50);
    expect(ends).toEqual([]);
    audio.currentTime = 12.01;
    vi.advanceTimersByTime(50);
    expect(audio.paused).toBe(true);
    expect(ends).toEqual([null]);
  });

  it('stops from a timeupdate even when timers are throttled', async () => {
    const { player, audios, ends } = setup([meeting]);
    await player.play('m1', 1000, 2000);
    const audio = audios[0] as FakeAudio;
    audio.currentTime = 2.2;
    audio.listeners.get('timeupdate')?.();
    expect(ends).toEqual([null]);
  });

  it('reports the end once when the clock check and the fallback both fire', async () => {
    const { player, audios, ends } = setup([meeting]);
    await player.play('m1', 1000, 2000);
    (audios[0] as FakeAudio).currentTime = 3;
    vi.advanceTimersByTime(5000);
    expect(ends).toEqual([null]);
  });

  it('stops when the chunk ends before the clip does', async () => {
    const { player, audios, ends } = setup([{ ...meeting, endMs: 5000 }]);
    await player.play('m1', 4000, 9000);
    audios[0]?.listeners.get('ended')?.();
    expect(ends).toEqual([null]);
  });

  it('stop pauses at once and ends the backend session', async () => {
    const { player, audios, ends, calls } = setup([meeting]);
    await player.play('m1', 1000, 5000);
    player.stop();
    expect((audios[0] as FakeAudio).paused).toBe(true);
    expect(calls).toEqual(['seekAudio', 'getPlaybackMedia', 'pauseAudio']);
    vi.advanceTimersByTime(10_000);
    expect(ends).toEqual([]);
  });

  it('says so when there is no audio for the range', async () => {
    const { player, ends, calls } = setup([]);
    await player.play('m1', 1000, 5000);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatch(/isn.t available/);
    expect(calls.at(-1)).toBe('pauseAudio');
  });

  it('uses the app volume and mute settings', async () => {
    window.localStorage.setItem('scrb.playback.volume', '0.4');
    window.localStorage.setItem('scrb.playback.muted', 'true');
    const { player, audios } = setup([meeting]);
    await player.play('m1', 10_000, 12_000);
    expect(audios[0]?.volume).toBe(0.4);
    expect(audios[0]?.muted).toBe(true);
  });

  it('is silent when the stored volume is zero', async () => {
    window.localStorage.setItem('scrb.playback.volume', '0');
    const { player, audios } = setup([meeting]);
    await player.play('m1', 10_000, 12_000);
    expect(audios[0]?.muted).toBe(true);
  });

  it('is ended by other playback and says it was interrupted', async () => {
    const { backend, audios, ends } = setup([meeting]);
    const interrupted: Array<boolean | undefined> = [];
    const own = new ClipPlayer(
      backend,
      (_error, flag) => interrupted.push(flag),
      () => {
        const audio = new FakeAudio();
        audios.push(audio);
        return audio as unknown as AudioOutput;
      },
    );
    await own.play('m1', 10_000, 12_000);
    stopClipPlayback();
    expect((audios.at(-1) as FakeAudio).paused).toBe(true);
    expect(interrupted).toEqual([true]);
    expect(ends).toEqual([]);
  });

  it('lets only one clip sound at a time', async () => {
    const first = setup([meeting]);
    const second = setup([meeting]);
    await first.player.play('m1', 10_000, 12_000);
    await second.player.play('m2', 10_000, 12_000);
    expect(first.audios[0]?.paused).toBe(true);
    expect(second.audios[0]?.paused).toBe(false);
    expect(first.ends).toEqual([null]);
  });
});
