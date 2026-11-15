import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileClip, ProfileId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { ClipPlayer } from '../../lib/clip-player.ts';
import { usePauseSharedPlayback } from '../../lib/playback-context.tsx';

export const NO_PREVIEW = 'No audio available to preview.';

/** Plays a profile's sample passages one after another, and stops on the audio clock. */
export function useProfilePreview(profileId: ProfileId) {
  const backend = useBackend();
  const pauseShared = usePauseSharedPlayback();
  const [clips, setClips] = useState<ProfileClip[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useRef<ClipPlayer | null>(null);
  const list = useRef<ProfileClip[]>([]);
  const index = useRef<number | null>(null);
  const start = useCallback((at: number) => {
    const clip = list.current[at];
    if (!clip) {
      index.current = null;
      setPlaying(null);
      return;
    }
    index.current = at;
    setPlaying(at);
    void player.current?.play(clip.meetingId, clip.startMs, clip.endMs, clip.track);
  }, []);

  useEffect(() => {
    const clip = new ClipPlayer(backend, (error, interrupted) => {
      if (error || interrupted) {
        index.current = null;
        setPlaying(null);
        setMessage(error);
      } else {
        start((index.current ?? -1) + 1);
      }
    });
    player.current = clip;
    return () => {
      index.current = null;
      clip.stop();
      player.current = null;
    };
  }, [backend, start]);

  const stop = useCallback(() => {
    index.current = null;
    player.current?.stop();
    setPlaying(null);
  }, []);

  /** Plays the whole sample, or the one passage `only`; a second press stops. */
  const play = useCallback(
    async (only?: number) => {
      setMessage(null);
      if (index.current !== null) return stop();
      setLoading(true);
      try {
        if (list.current.length === 0) {
          list.current = (await backend.call('getProfileClips', { profileId })).clips;
          setClips(list.current);
        }
        if (list.current.length === 0) return setMessage(NO_PREVIEW);
        pauseShared();
        if (only === undefined) return start(0);
        // One passage: play it alone by ending the list after it.
        const clip = list.current[only];
        if (!clip) return;
        index.current = list.current.length - 1;
        setPlaying(only);
        void player.current?.play(clip.meetingId, clip.startMs, clip.endMs, clip.track);
      } catch (failure) {
        setMessage(failure instanceof Error ? failure.message : NO_PREVIEW);
      } finally {
        setLoading(false);
      }
    },
    [backend, profileId, pauseShared, start, stop],
  );

  return { clips, playing, message, loading, play, stop };
}
