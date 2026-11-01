import { useState } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useRecordingStatus } from '../shell/use-recording-status.ts';
import styles from './PrivacyBanner.module.css';

/** Dismissing lasts for one recording: the banner returns for every new meeting id. */
export function PrivacyBanner() {
  const { recording } = useRecordingStatus();
  const [dismissed, setDismissed] = useState<MeetingId | null>(null);
  if (!recording.privacyBannerRequired || recording.meetingId === dismissed) return null;
  return (
    <div className={styles.banner} role="status">
      <span>Voice profiles are being built from this recording.</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss voice-profile privacy reminder for this recording"
        onClick={() => setDismissed(recording.meetingId)}
      >
        Dismiss
      </button>
    </div>
  );
}
