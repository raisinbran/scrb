import type { PauseReason, RecordingStatus } from '@scrb/contracts';
import { RecordingDot } from '../../components/RecordingDot.tsx';
import { Tooltip } from '../../components/Tooltip.tsx';
import { formatElapsed } from '../../lib/format.ts';
import styles from '../LiveScreen.module.css';

interface RecordingControlsProps {
  status: RecordingStatus;
  elapsedMs: number;
  pauseReason: PauseReason | null;
  busy: boolean;
  /** True while live transcription is running, for the dot's tooltip. */
  transcribing: boolean;
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
  const { status, elapsedMs, pauseReason, busy, transcribing, onStart, onPause, onResume, onStop } =
    props;
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
        {status === 'recording' || status === 'paused' ? (
          <RecordingDot status={status} transcribing={transcribing} className={styles.dot} />
        ) : (
          <span className={styles.dot} data-state={status} aria-hidden="true" />
        )}
        {STATUS_TEXT[status]}
      </span>
      {active && (
        <Tooltip label="Elapsed recording time">
          <span className={styles.elapsed} tabIndex={0}>
            {formatElapsed(elapsedMs)}
          </span>
        </Tooltip>
      )}
      {status === 'paused' && (
        <span className={styles.hint}>
          {pauseReason === 'meetingAppExited' ? 'The meeting app closed. ' : ''}
          No new audio is being recorded.
        </span>
      )}
    </div>
  );
}
