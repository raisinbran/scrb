import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { PlaybackEngine } from '../../lib/playback-engine.ts';

/** Click-to-play state for one meeting. `positionMs` is null while nothing plays. */
export function usePlayback(meetingId: MeetingId) {
  const backend = useBackend();
  const [positionMs, setPositionMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engine = useRef<PlaybackEngine | null>(null);
  const playing = useRef(false);

  useEffect(() => {
    const audio = new PlaybackEngine(backend, meetingId, setError);
    engine.current = audio;
    const off = backend.on('playbackPosition', (playback) => {
      if (playback.meetingId !== meetingId) return;
      playing.current = playback.isPlaying;
      setPositionMs(playback.isPlaying ? playback.positionMs : null);
    });
    return () => {
      off();
      audio.dispose();
      if (playing.current) void backend.call('pauseAudio', { meetingId }).catch(() => undefined);
    };
  }, [backend, meetingId]);

  const play = useCallback((ms: number) => {
    setError(null);
    engine.current?.seek(ms).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'That audio could not be played.');
    });
  }, []);

  const stop = useCallback(() => {
    void backend.call('pauseAudio', { meetingId }).catch(() => setPositionMs(null));
  }, [backend, meetingId]);

  return { positionMs, error, play, stop };
}
