import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';

export interface Playback {
  positionMs: number;
  isPlaying: boolean;
  error: string | null;
  play(positionMs: number): void;
  pause(): void;
  /** Moves the position without starting playback. */
  setPosition(positionMs: number): void;
}

/** Audio plays in the backend; this mirrors its position for every tab of one meeting. */
export function usePlayback(meetingId: MeetingId): Playback {
  const backend = useBackend();
  const [positionMs, setPositionMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playing = useRef(false);

  useEffect(() => {
    const off = backend.on('playbackPosition', (position) => {
      if (position.meetingId !== meetingId) return;
      setPositionMs(position.positionMs);
      setIsPlaying(position.isPlaying);
      playing.current = position.isPlaying;
    });
    return () => {
      off();
      if (playing.current) void backend.call('pauseAudio', { meetingId }).catch(() => undefined);
    };
  }, [backend, meetingId]);

  const report = useCallback((failure: unknown) => {
    setError(failure instanceof Error ? failure.message : 'The audio could not be played.');
  }, []);

  const play = useCallback(
    (target: number) => {
      setError(null);
      setPositionMs(target);
      backend.call('seekAudio', { meetingId, positionMs: Math.round(target) }).catch(report);
    },
    [backend, meetingId, report],
  );

  const pause = useCallback(() => {
    backend.call('pauseAudio', { meetingId }).catch(report);
  }, [backend, meetingId, report]);

  return { positionMs, isPlaying, error, play, pause, setPosition: setPositionMs };
}
