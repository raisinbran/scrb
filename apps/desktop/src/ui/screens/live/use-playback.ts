import { useCallback, useEffect, useState } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';

/** Click-to-play state for one meeting. `positionMs` is null while nothing plays. */
export function usePlayback(meetingId: MeetingId) {
  const backend = useBackend();
  const [positionMs, setPositionMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      backend.on('playbackPosition', (playback) => {
        if (playback.meetingId !== meetingId) return;
        setPositionMs(playback.isPlaying ? playback.positionMs : null);
      }),
    [backend, meetingId],
  );

  const play = useCallback(
    (ms: number) => {
      setError(null);
      backend.call('seekAudio', { meetingId, positionMs: ms }).catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'That audio could not be played.');
      });
    },
    [backend, meetingId],
  );

  const stop = useCallback(() => {
    void backend.call('pauseAudio', { meetingId }).catch(() => setPositionMs(null));
  }, [backend, meetingId]);

  return { positionMs, error, play, stop };
}
