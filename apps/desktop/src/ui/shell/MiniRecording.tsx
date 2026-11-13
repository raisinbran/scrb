import { useEffect, useState } from 'react';
import { formatElapsed } from '../lib/format.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './MiniRecording.module.css';

/** The small window shown over other apps: status and time only, never transcript text. */
export function MiniRecording() {
  const { recording, recordingAt, health, lag } = useRecordingStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (recording.status !== 'recording') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [recording.status]);

  const active = recording.status === 'recording' || recording.status === 'paused';
  if (!active) {
    return (
      <p className={styles.mini} role="status">
        Not recording
      </p>
    );
  }
  const elapsed =
    recording.elapsedMs + (recording.status === 'recording' ? Math.max(0, now - recordingAt) : 0);
  const warning =
    health && health.level !== 'ok'
      ? (health.warnings[0]?.message ?? 'Recording needs attention')
      : lag && (lag.status === 'failed' || lag.status === 'lagging')
        ? 'Transcription behind'
        : null;
  return (
    <div className={styles.mini} role="status">
      <span className={styles.line}>
        <span className={styles.dot} data-state={recording.status} aria-hidden="true" />
        {recording.status === 'recording' ? 'Recording' : 'Paused'}{' '}
        <span className={styles.elapsed}>{formatElapsed(elapsed)}</span>
      </span>
      {warning && <span className={styles.warning}>{warning}</span>}
    </div>
  );
}
