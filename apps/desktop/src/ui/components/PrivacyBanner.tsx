import { useEffect, useState, useSyncExternalStore } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { noteOptionalDismiss, useNotificationEnabled } from '../lib/notification-prefs.ts';
import { useBackend } from '../lib/backend-context.tsx';
import { US_STATES, isListedState } from '../lib/us-states.ts';
import { useRecordingStatus } from '../shell/use-recording-status.ts';
import styles from './PrivacyBanner.module.css';

// One dismissal is shared by every place the banner can show (Live and the app shell).
let dismissedId: MeetingId | null = null;
const listeners = new Set<() => void>();
const dismissOnly = (id: MeetingId) => {
  dismissedId = id;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Dismissing lasts for one recording: the banner returns for every new meeting id. */
export function PrivacyBanner() {
  const backend = useBackend();
  const { recording } = useRecordingStatus();
  const dismissed = useSyncExternalStore(subscribe, () => dismissedId);
  const privacyOn = useNotificationEnabled('privacy');
  const [usState, setUsState] = useState<string | null>(null);
  const meetingId = recording.meetingId;
  // The saved location is read at the start of each recording, so a change in Settings applies.
  useEffect(() => {
    if (!meetingId) return;
    let live = true;
    void backend.call('getSettings').then(({ location }) => {
      if (live) setUsState(location.country === 'US' ? location.usState : null);
    });
    return () => {
      live = false;
    };
  }, [backend, meetingId]);
  if (!privacyOn || !recording.privacyBannerRequired || meetingId === dismissed) return null;
  const stateName = isListedState(usState)
    ? US_STATES.find((state) => state.code === usState)?.name
    : undefined;
  return (
    <div className={styles.banner} role="status" data-level={stateName ? 'warning' : undefined}>
      <span>
        {stateName ? `${stateName} has a biometric-privacy law. ` : ''}
        Voice profiles are being built from this recording.
        {stateName ? " Check whether you need people's consent." : ''}
      </span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss voice-profile privacy reminder for this recording"
        onClick={() => {
          if (!meetingId) return;
          dismissOnly(meetingId);
          noteOptionalDismiss();
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
