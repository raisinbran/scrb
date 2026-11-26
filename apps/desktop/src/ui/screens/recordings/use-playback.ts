import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { PlaybackEngine } from '../../lib/playback-engine.ts';
import { MUTED_KEY, nextRate, storedVolume, VOLUME_KEY } from '../../lib/playback-level.ts';
import { readStored, writeStored } from '../../lib/stored-value.ts';
import { stopClipPlayback } from '../../lib/clip-player.ts';
import { clipSessionOpen } from '../../lib/clip-session.ts';

const AUDIBLE_KEY = 'scrb.playback.lastAudibleVolume';
const DEFAULT_AUDIBLE_VOLUME = 0.5;

export interface Playback {
  positionMs: number;
  isPlaying: boolean;
  error: string | null;
  play(positionMs: number): void;
  pause(): void;
  /** Moves the position without starting playback. */
  setPosition(positionMs: number): void;
  /** The app's own playback level, 0 to 1. The system volume is never touched. */
  volume: number;
  muted: boolean;
  setVolume(volume: number): void;
  /** Silent: muted, or at zero volume. Unmuting restores an audible level. */
  toggleMute(): void;
  /** Playback speed, 0.25 to 2. It starts at 1 for every meeting and is kept while one is open. */
  rate: number;
  /** Steps to the next speed. */
  cycleRate(): void;
}

/** The backend keeps the clock; this mirrors its position for every tab of one meeting. */
/** A null meeting is idle: no audio is opened and nothing is sent to the backend. */
export function usePlayback(meetingId: MeetingId | null): Playback {
  const backend = useBackend();
  const [positionMs, setPositionMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playing = useRef(false);
  const engine = useRef<PlaybackEngine | null>(null);
  const [volume, setVolumeState] = useState(storedVolume);
  const [muted, setMutedState] = useState(() => readStored<boolean>(MUTED_KEY) === true);
  const [lastAudible, setLastAudible] = useState(() => {
    const value = readStored<number>(AUDIBLE_KEY);
    return typeof value === 'number' && value > 0 && value <= 1 ? value : DEFAULT_AUDIBLE_VOLUME;
  });
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);
  const level = useRef({ volume, muted });
  useEffect(() => {
    level.current = { volume, muted: muted || volume === 0 };
    engine.current?.setVolume(volume, muted || volume === 0);
  }, [volume, muted]);

  useEffect(() => {
    if (meetingId === null) return;
    const audio = new PlaybackEngine(backend, meetingId, setError);
    engine.current = audio;
    audio.setVolume(level.current.volume, level.current.muted);
    const off = backend.on('playbackPosition', (position) => {
      if (position.meetingId !== meetingId) return;
      // Events of a clip's borrowed session are not this meeting's, except a pause of its audio.
      if (clipSessionOpen() && (position.isPlaying || !playing.current)) return;
      setPositionMs(position.positionMs);
      setIsPlaying(position.isPlaying);
      playing.current = position.isPlaying;
    });
    return () => {
      off();
      audio.dispose();
      engine.current = null;
      // The backend keeps one speed; the next meeting starts at normal speed.
      if (rateRef.current !== 1) {
        rateRef.current = 1;
        setRateState(1);
        void backend.call('setPlaybackRate', { meetingId, rate: 1 }).catch(() => undefined);
      }
      if (playing.current) void backend.call('pauseAudio', { meetingId }).catch(() => undefined);
      playing.current = false;
      setIsPlaying(false);
      setPositionMs(0);
    };
  }, [backend, meetingId]);

  const report = useCallback((failure: unknown) => {
    setError(failure instanceof Error ? failure.message : 'The audio could not be played.');
  }, []);

  const play = useCallback(
    (target: number) => {
      if (meetingId === null) return;
      stopClipPlayback();
      setError(null);
      setPositionMs(target);
      engine.current?.seek(Math.round(target)).catch(report);
    },
    [meetingId, report],
  );

  const pause = useCallback(() => {
    if (meetingId === null) return;
    backend.call('pauseAudio', { meetingId }).catch(report);
  }, [backend, meetingId, report]);

  const cycleRate = useCallback(() => {
    if (meetingId === null) return;
    const next = nextRate(rateRef.current);
    backend
      .call('setPlaybackRate', { meetingId, rate: next })
      .then(() => {
        rateRef.current = next;
        setRateState(next);
        engine.current?.setRate(next);
      })
      .catch(report);
  }, [backend, meetingId, report]);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setVolumeState(clamped);
    writeStored(VOLUME_KEY, clamped);
    // Raising the level is a request to hear it.
    if (clamped > 0) {
      setMutedState(false);
      writeStored(MUTED_KEY, false);
      setLastAudible(clamped);
      writeStored(AUDIBLE_KEY, clamped);
    }
  }, []);
  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      // A zero level counts as muted, so unmuting must bring back something audible.
      if (volume === 0) setVolume(lastAudible);
      setMutedState(false);
      writeStored(MUTED_KEY, false);
    } else {
      setMutedState(true);
      writeStored(MUTED_KEY, true);
    }
  }, [muted, volume, lastAudible, setVolume]);

  return {
    positionMs,
    isPlaying,
    error,
    play,
    pause,
    setPosition: setPositionMs,
    volume,
    muted: muted || volume === 0,
    setVolume,
    toggleMute,
    rate,
    cycleRate,
  };
}
