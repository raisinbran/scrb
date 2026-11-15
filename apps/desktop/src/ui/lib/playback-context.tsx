import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MeetingId } from '@scrb/contracts';
import { usePlayback, type Playback } from '../screens/recordings/use-playback.ts';

interface PlaybackContextValue {
  meetingId: MeetingId | null;
  playback: Playback;
  select(meetingId: MeetingId): void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * Owns the one playback of the app, so audio keeps playing while another tab is open.
 * Choosing a different meeting pauses the one that was playing.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [meetingId, select] = useState<MeetingId | null>(null);
  const playback = usePlayback(meetingId);
  const value = useMemo(() => ({ meetingId, playback, select }), [meetingId, playback]);
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

/** The meeting that is playing right now, for the sidebar and the list. Null when nothing plays. */
export function useNowPlaying(): MeetingId | null {
  const context = useContext(PlaybackContext);
  return context?.playback.isPlaying ? context.meetingId : null;
}

/**
 * Playback of one meeting. Inside the app it is shared and survives leaving the page; without a
 * provider (some tests) the meeting plays on its own and stops when the page closes.
 */
export function useMeetingPlayback(meetingId: MeetingId): Playback {
  const context = useContext(PlaybackContext);
  const own = usePlayback(context ? null : meetingId);
  const select = context?.select;
  useLayoutEffect(() => select?.(meetingId), [select, meetingId]);
  if (!context) return own;
  if (context.meetingId !== meetingId) {
    return { ...context.playback, positionMs: 0, isPlaying: false, error: null };
  }
  return context.playback;
}
