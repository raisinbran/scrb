import { noteOptionalDismiss, useNotificationEnabled } from '../../lib/notification-prefs.ts';
import type { FinalPassStage } from '@scrb/contracts';
export { nextProgress } from '../../lib/final-pass-progress.ts';
import { useFinalPassProgress } from '../../lib/final-pass-progress.ts';
import { NoticeStrip } from '../../components/Notices.tsx';
import { Progress } from '../../components/Progress.tsx';
import styles from './recordings.module.css';

const STAGE_LABELS: Record<FinalPassStage, string> = {
  queued: 'Waiting to start...',
  transcribing: 'Transcribing...',
  diarizing: 'Working out who spoke...',
  finishing: 'Finishing up...',
};

/** Fills from the backend's final-pass progress; until a report arrives the bar is empty. */
export function ProcessingBanner({
  meetingId,
  dismissed,
  onDismiss,
}: {
  meetingId: string;
  dismissed: boolean;
  onDismiss(): void;
}) {
  const progressNoticesOn = useNotificationEnabled('progress');
  const progress = useFinalPassProgress(meetingId);
  if (dismissed || !progressNoticesOn) return null;
  return (
    <NoticeStrip
      onDismiss={() => {
        onDismiss();
        noteOptionalDismiss();
      }}
      progress={<Progress label="Final transcript processing" fraction={progress?.fraction ?? 0} />}
    >
      Processing final transcript. Text may change.{' '}
      <span className={styles.muted}>{STAGE_LABELS[progress?.stage ?? 'queued']}</span>
    </NoticeStrip>
  );
}
