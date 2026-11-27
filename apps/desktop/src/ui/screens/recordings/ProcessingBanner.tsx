import { useState } from 'react';
import { noteOptionalDismiss, useNotificationEnabled } from '../../lib/notification-prefs.ts';
import type { FinalPassStage } from '@scrb/contracts';
export { nextProgress } from '../../lib/final-pass-progress.ts';
import { useFinalPassProgress } from '../../lib/final-pass-progress.ts';
import { PopupBanner } from '../../components/PopupBanner.tsx';
import { Progress } from '../../components/Progress.tsx';
import styles from './recordings.module.css';

const STAGE_LABELS: Record<FinalPassStage, string> = {
  queued: 'Waiting to start...',
  transcribing: 'Transcribing...',
  diarizing: 'Working out who spoke...',
  finishing: 'Finishing up...',
};

/** Fills from the backend's final-pass progress; until a report arrives the bar is empty. */
export function ProcessingBanner({ meetingId }: { meetingId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const progressNoticesOn = useNotificationEnabled('progress');
  const progress = useFinalPassProgress(meetingId);
  if (dismissed || !progressNoticesOn) return null;
  return (
    <PopupBanner
      className={styles.processingBanner}
      onDismiss={() => {
        setDismissed(true);
        noteOptionalDismiss();
      }}
    >
      <p role="status">
        Processing final transcript. Text may change.{' '}
        <span className={styles.muted}>{STAGE_LABELS[progress?.stage ?? 'queued']}</span>
      </p>
      <div className={styles.slimBar}>
        <Progress label="Final transcript processing" fraction={progress?.fraction ?? 0} />
      </div>
    </PopupBanner>
  );
}
