import { useEffect, useState } from 'react';
import type { RecordingHealth, TranscriptionLag } from '@scrb/contracts';
import { LAG_NOTICE_MS } from '../lib/lag.ts';
import { formatElapsed } from '../lib/format.ts';
import { useMockMode, useSetupBlocked } from '../lib/mock-mode.tsx';
import { useBackend } from '../lib/backend-context.tsx';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './TitleBar.module.css';

const LAG_TEXT: Partial<Record<TranscriptionLag['status'], string>> = {
  lagging: 'Catching up',
  failed: 'Transcription stopped',
  restarting: 'Transcription restarting',
  ok: 'Transcription live',
};

function healthText(health: RecordingHealth | null): string | null {
  if (!health || health.level === 'ok') return null;
  return health.warnings[0]?.message ?? 'Recording needs attention';
}

/** True while the user has hidden the mini window; the main process says so. */
function useMiniHidden(): boolean {
  const backend = useBackend();
  const [hidden, setHidden] = useState(false);
  useEffect(
    () => backend.on('miniWindowHiddenChanged', (event) => setHidden(event.hidden)),
    [backend],
  );
  return hidden;
}

export function TitleBar() {
  const { recording, health, lag } = useRecordingStatus();
  const mockMode = useMockMode();
  const backend = useBackend();
  const miniHidden = useMiniHidden();
  const setupBlocked = useSetupBlocked();
  const active = recording.status === 'recording' || recording.status === 'paused';
  const warning = active ? healthText(health) : null;
  const lagText =
    active && lag && !(lag.status === 'lagging' && lag.lagMs < LAG_NOTICE_MS)
      ? LAG_TEXT[lag.status]
      : undefined;
  return (
    <header className={styles.bar}>
      <span className={styles.name}>Scribe</span>
      <div className={styles.status}>
        {setupBlocked && (
          <span className={styles.mock} data-testid="setup-incomplete-marker" title={setupBlocked}>
            Setup incomplete
          </span>
        )}
        {mockMode && (
          <span
            className={styles.mock}
            data-testid="mock-backend-marker"
            title="Recording or the final pass is simulated. Start the app with scripts/m1.sh to record real meetings."
          >
            Mock backend
          </span>
        )}
        {lagText && (
          <span
            className={styles.lag}
            data-testid="transcription-status"
            data-level={lag?.status === 'ok' || lag?.status === 'lagging' ? 'ok' : 'warning'}
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
        {active && miniHidden && (
          <button
            type="button"
            className={styles.showMini}
            title="Show the small recording window again"
            onClick={() => void backend.call('showMiniWindow').catch(() => undefined)}
          >
            Show mini window
          </button>
        )}
      </div>
    </header>
  );
}
