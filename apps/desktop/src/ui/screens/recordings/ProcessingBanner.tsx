import { useEffect, useState } from 'react';
import { formatElapsed } from '../../lib/format.ts';
import styles from './recordings.module.css';

/** The contract reports no final-pass progress, so this shows time since the view opened. */
export function ProcessingBanner() {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const opened = performance.now();
    const timer = setInterval(() => setElapsedMs(performance.now() - opened), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className={styles.bannerInfo}>
      <div className={styles.processing}>
        <p role="status">
          <strong>Final transcript is still being processed.</strong> This text is provisional and
          will change when processing finishes. Your corrections are kept.
        </p>
        <progress className={styles.progress} aria-label="Final transcript processing" />
        <p className={styles.muted} aria-hidden="true">
          Time since you opened this view: {formatElapsed(elapsedMs)}. This updates by itself.
        </p>
      </div>
    </div>
  );
}
