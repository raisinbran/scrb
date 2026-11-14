import { useEffect, useState } from 'react';
import type { FinalPassProgress, FinalPassStage } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { DismissButton } from '../../components/DismissButton.tsx';
import { Progress } from '../../components/Progress.tsx';
import { useRemembered } from '../../lib/tab-memory.ts';
import { formatElapsed } from '../../lib/format.ts';
import styles from './recordings.module.css';

const STAGE_ORDER: FinalPassStage[] = ['queued', 'transcribing', 'diarizing', 'finishing'];

/** Reports can arrive late or out of order; one that goes backwards within a pass is ignored. A later `startedAt` is a new pass; an earlier one is a late report from an old pass. */
export function nextProgress(
  current: FinalPassProgress | null,
  report: FinalPassProgress,
): FinalPassProgress | null {
  if (!current) return report;
  const started = Date.parse(report.startedAt);
  const currentStarted = Date.parse(current.startedAt);
  if (started > currentStarted) return report;
  if (started < currentStarted) return current;
  const earlier = STAGE_ORDER.indexOf(report.stage) < STAGE_ORDER.indexOf(current.stage);
  return earlier || report.fraction < current.fraction ? current : report;
}

const STAGE_LABELS: Record<FinalPassStage, string> = {
  queued: 'Waiting to start',
  transcribing: 'Transcribing',
  diarizing: 'Working out who spoke',
  finishing: 'Finishing up',
};

/** Fills from the backend's final-pass progress; until a report arrives it shows time since the view opened. */
export function ProcessingBanner({ meetingId }: { meetingId: string }) {
  const [dismissed, setDismissed] = useRemembered(`notice.final-pass.${meetingId}`, false);
  const backend = useBackend();
  const [progress, setProgress] = useState<FinalPassProgress | null>(null);
  useEffect(
    () =>
      backend.on('finalPassProgress', (report) => {
        if (report.meetingId === meetingId) setProgress((current) => nextProgress(current, report));
      }),
    [backend, meetingId],
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const opened = performance.now();
    const timer = setInterval(() => setElapsedMs(performance.now() - opened), 1000);
    return () => clearInterval(timer);
  }, []);
  if (dismissed) return null;
  return (
    <div className={styles.bannerInfo}>
      <div className={styles.processing}>
        <div className={styles.dismissible}>
          <p role="status">
            <strong>Final transcript is still being processed.</strong> This text is provisional and
            will change when processing finishes. Your corrections are kept.
          </p>
          <DismissButton label="Dismiss notice" onClick={() => setDismissed(true)} />
        </div>
        {progress && <p className={styles.muted}>{STAGE_LABELS[progress.stage]}</p>}
        <Progress label="Final transcript processing" fraction={progress?.fraction} />
        {!progress && (
          <p className={styles.muted} aria-hidden="true">
            Time since you opened this view: {formatElapsed(elapsedMs)}. This updates by itself.
          </p>
        )}
      </div>
    </div>
  );
}
