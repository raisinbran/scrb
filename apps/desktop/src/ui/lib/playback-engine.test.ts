import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, PlaybackPosition } from '@scrb/contracts';
import { PlaybackEngine, type AudioOutput } from './playback-engine.ts';

class FakeAudio {
  src = '';
  preload = '';
  currentTime = 0;
  paused = true;
  seeking = false;
  volume = 1;
  muted = false;
  readyState = 4;
  listeners = new Map<string, () => void>();
  played = 0;
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener);
  }
  play() {
    this.paused = false;
    this.played += 1;
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

const url = (track: string, startMs: number) => `scribe-media://media/n/${track}/${startMs}`;
const chunk = (track: 'microphone' | 'meeting', startMs: number, endMs: number) => ({
  track,
  startMs,
  endMs,
  url: url(track, startMs),
});

/** Two tracks 0-5 s, a gap, then the microphone alone 60-65 s. */
function setup() {
  let listener: (position: PlaybackPosition) => void = () => undefined;
  const emit = (positionMs: number, isPlaying = true, meetingId = 'm') =>
    listener({ meetingId, positionMs, isPlaying });
  const call = vi.fn(async (name: string, request: { positionMs: number }) => {
    await Promise.resolve();
    if (name === 'seekAudio') emit(request.positionMs);
    if (name !== 'getPlaybackMedia') return undefined;
    return request.positionMs < 5000
      ? {
          chunks: [chunk('microphone', 0, 5000), chunk('meeting', 0, 5000)],
          nextPositionMs: 60_000,
        }
      : { chunks: [chunk('microphone', 60_000, 65_000)], nextPositionMs: null };
  });
  const backend = {
    call,
    on: (_name: string, handler: typeof listener) => {
      listener = handler;
      return () => {
        listener = () => undefined;
      };
    },
  } as unknown as Backend;
  const audios: FakeAudio[] = [];
  const errors: string[] = [];
  let clock = 0;
  const engine = new PlaybackEngine(
    backend,
    'm',
    (message) => errors.push(message),
    () => {
      const audio = new FakeAudio();
      audios.push(audio);
      return audio as unknown as AudioOutput;
    },
    () => clock,
  );
  const settle = () => vi.advanceTimersByTimeAsync(0);
  const advance = async (ms: number) => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(50);
  };
  return { engine, audios, errors, emit, call, settle, advance };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('PlaybackEngine', () => {
  it('starts both tracks together at the offset inside their chunks', async () => {
    const t = setup();
    await t.engine.seek(1500);
    await t.settle();
    expect(t.audios.map(({ src }) => src)).toEqual([url('microphone', 0), url('meeting', 0)]);
    expect(t.audios.map(({ currentTime }) => currentTime)).toEqual([1.5, 1.5]);
    expect(t.audios.every(({ paused }) => !paused)).toBe(true);
  });

  it('pulls a track that drifts back to the shared clock', async () => {
    const t = setup();
    await t.engine.seek(0);
    await t.settle();
    const [microphone, meeting] = t.audios as [FakeAudio, FakeAudio];
    microphone.currentTime = 1;
    meeting.currentTime = 0.5;
    await t.advance(1000);
    expect(microphone.currentTime).toBe(1);
    expect(meeting.currentTime).toBe(1);
  });

  it('waits out no gap: a backend jump starts the next audio at original time', async () => {
    const t = setup();
    await t.engine.seek(4000);
    await t.settle();
    await t.advance(1100);
    expect(t.audios.slice(0, 2).every(({ src }) => src === '')).toBe(true);
    t.emit(60_000);
    await t.settle();
    const last = t.audios.at(-1) as FakeAudio;
    expect(last.src).toBe(url('microphone', 60_000));
    expect(last.played).toBe(1);
    expect(t.audios.filter(({ paused }) => !paused)).toEqual([last]);
  });

  it('requests the next chunk ahead and holds it until its time', async () => {
    const t = setup();
    await t.engine.seek(58_500);
    await t.settle();
    const [mic] = t.audios as [FakeAudio];
    expect(mic.src).toBe(url('microphone', 60_000));
    expect(mic.preload).toBe('auto');
    expect(mic.played).toBe(0);
    await t.advance(1500);
    expect(mic.played).toBe(1);
  });

  it('releases everything on pause and on dispose', async () => {
    const t = setup();
    await t.engine.seek(0);
    await t.settle();
    t.emit(100, false);
    expect(t.audios.every(({ paused, src }) => paused && src === '')).toBe(true);
    await t.engine.seek(0);
    await t.settle();
    t.engine.dispose();
    expect(t.audios.every(({ paused, src }) => paused && src === '')).toBe(true);
    const calls = t.call.mock.calls.length;
    await t.advance(5000);
    expect(t.call.mock.calls).toHaveLength(calls);
  });

  it('ignores another meeting and a stale tick that lands during a seek', async () => {
    const t = setup();
    await t.engine.seek(30_000);
    await t.settle();
    t.emit(0, false, 'other');
    expect(t.audios[0]?.src).not.toBe('');
    const backward = t.engine.seek(1000);
    t.emit(30_250);
    await backward;
    await t.settle();
    expect(t.audios.at(-1)?.src).toBe(url('meeting', 0));
  });

  it('keeps the other track when one chunk cannot be read', async () => {
    const t = setup();
    await t.engine.seek(0);
    await t.settle();
    const [microphone, meeting] = t.audios as [FakeAudio, FakeAudio];
    microphone.listeners.get('error')?.();
    await t.advance(100);
    expect(t.errors).toEqual(['Some of the audio could not be played.']);
    expect(microphone.src).toBe('');
    expect(meeting.paused).toBe(false);
  });

  it('sets the app volume and mute on every element, including ones created later', async () => {
    const t = setup();
    t.engine.setVolume(0.4, false);
    await t.engine.seek(0);
    await t.settle();
    expect(t.audios.map(({ volume }) => volume)).toEqual([0.4, 0.4]);
    t.engine.setVolume(0.7, true);
    expect(t.audios.map(({ volume, muted }) => [volume, muted])).toEqual([
      [0.7, true],
      [0.7, true],
    ]);
    t.engine.setVolume(5, false);
    expect(t.audios.every(({ volume }) => volume === 1)).toBe(true);
  });
});
