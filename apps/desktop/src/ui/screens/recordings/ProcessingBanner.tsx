import { useEffect, useState } from 'react';
import type { MeetingDetail } from '@scrb/contracts';
import { formatElapsed } from '../../lib/format.ts';
import styles from './recordings.module.css';

/** The contract reports no final-pass progress, so this estimates time from when recording ended. */
export function ProcessingBanner({ meeting }: { meeting: MeetingDetail }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stoppedAt = Date.parse(meeting.startedAt) + meeting.durationMs;
  const elapsedMs = Math.max(0, now - stoppedAt);
  return (
    <div role="status" className={styles.bannerInfo}>
      <div className={styles.processing}>
        <p>
          <strong>Final transcript is still being processed.</strong> This text is provisional and
          will change when processing finishes. Your corrections are kept.
        </p>
        <progress className={styles.progress} aria-label="Final transcript processing" />
        <p className={styles.muted}>
          About {formatElapsed(elapsedMs)} since recording stopped. This updates by itself.
        </p>
      </div>
    </div>
  );
}
