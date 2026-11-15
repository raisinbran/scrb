import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from '@scrb/contracts';
import { ClipPlayer } from './clip-player.ts';
import type { AudioOutput } from './playback-engine.ts';

class FakeAudio {
  src = '';
  preload = '';
  currentTime = 0;
  paused = true;
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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
});
