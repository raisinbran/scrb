import type { RecordingHealth, TranscriptionLag } from '@scrb/contracts';
import { formatElapsed } from '../lib/format.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './TitleBar.module.css';

const LAG_TEXT: Partial<Record<TranscriptionLag['status'], string>> = {
  lagging: 'Transcription behind',
  failed: 'Transcription stopped',
  restarting: 'Transcription restarting',
  ok: 'Transcription live',
};

function healthText(health: RecordingHealth | null): string | null {
  if (!health || health.level === 'ok') return null;
  return health.warnings[0]?.message ?? 'Recording needs attention';
}

export function TitleBar() {
  const { recording, health, lag } = useRecordingStatus();
  const active = recording.status === 'recording' || recording.status === 'paused';
  const warning = active ? healthText(health) : null;
  const lagText = active && lag ? LAG_TEXT[lag.status] : undefined;
  return (
    <header className={styles.bar}>
      <span className={styles.name}>Meeting Scribe</span>
      <div className={styles.status}>
        {lagText && (
          <span
            className={styles.lag}
            data-testid="transcription-status"
            data-level={lag?.status === 'ok' ? 'ok' : 'warning'}
          >
            {lagText}
          </span>
        )}
        {warning && (
          <span className={styles.warning} role="status">
            {warning}
          </span>
        )}
        {active && (
          <span className={styles.indicator} data-testid="recording-indicator" role="status">
            <span className={styles.dot} data-state={recording.status} aria-hidden="true" />
            {recording.status === 'recording' ? 'Recording' : 'Paused'}{' '}
            <span className={styles.elapsed}>{formatElapsed(recording.elapsedMs)}</span>
          </span>
        )}
      </div>
    </header>
  );
}
