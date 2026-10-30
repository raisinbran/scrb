import type { RecordingStatus } from '@scrb/contracts';
import { formatElapsed } from '../../lib/format.ts';
import styles from '../LiveScreen.module.css';

interface RecordingControlsProps {
  status: RecordingStatus;
  elapsedMs: number;
  busy: boolean;
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
}

const STATUS_TEXT: Record<RecordingStatus, string> = {
  idle: 'Not recording',
  starting: 'Starting…',
  recording: 'Recording',
  paused: 'Paused',
  stopping: 'Stopping…',
};

export function RecordingControls(props: RecordingControlsProps) {
  const { status, elapsedMs, busy, onStart, onPause, onResume, onStop } = props;
  const active = status === 'recording' || status === 'paused';
  return (
    <div className={styles.controls} role="group" aria-label="Recording controls">
      {status === 'idle' || status === 'starting' ? (
        <button
          type="button"
          className={styles.startButton}
          disabled={busy || status === 'starting'}
          onClick={onStart}
        >
          Start
        </button>
      ) : (
        <>
          {status === 'paused' ? (
            <button type="button" className={styles.button} disabled={busy} onClick={onResume}>
              Resume
            </button>
          ) : (
            <button
              type="button"
              className={styles.button}
              disabled={busy || !active}
              onClick={onPause}
            >
              Pause
            </button>
          )}
          <button
            type="button"
            className={styles.stopButton}
            disabled={busy || !active}
            onClick={onStop}
          >
            Stop
          </button>
        </>
      )}
      <span className={styles.state} data-state={status} role="status">
        <span className={styles.dot} data-state={status} aria-hidden="true" />
        {STATUS_TEXT[status]}
      </span>
      {active && <span className={styles.elapsed}>{formatElapsed(elapsedMs)}</span>}
    </div>
  );
}
