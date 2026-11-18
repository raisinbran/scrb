import { Tooltip } from '../components/Tooltip.tsx';
import { useEffect, useState } from 'react';
import type { RecordingHealth, TranscriptionLag } from '@scrb/contracts';
import { LAG_NOTICE_MS } from '../lib/lag.ts';
import { formatElapsed } from '../lib/format.ts';
import { useMockMode, useSetupBlocked } from '../lib/mock-mode.tsx';
import { useBackend } from '../lib/backend-context.tsx';
import { useRecordingStatus } from './use-recording-status.ts';
import { useProcessingCounts } from './use-processing.ts';
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
  const { finalPass, importing } = useProcessingCounts();
  const setupBlocked = useSetupBlocked();
  const active = recording.status === 'recording' || recording.status === 'paused';
  const warning = active ? healthText(health) : null;
  const lagText =
    active && lag && !(lag.status === 'lagging' && lag.lagMs < LAG_NOTICE_MS)
      ? LAG_TEXT[lag.status]
      : undefined;
  const processingTotal = finalPass + importing;
  const processingText =
    mockMode || processingTotal === 0
      ? null
      : finalPass && importing
        ? `Background processing · ${processingTotal} meetings`
        : finalPass
          ? `Final transcription in progress · ${finalPass} ${finalPass === 1 ? 'meeting' : 'meetings'}`
          : `Import in progress · ${importing} ${importing === 1 ? 'meeting' : 'meetings'}`;
  return (
    <header className={styles.bar}>
      <span className={styles.name}>Scribe</span>
      <div className={styles.status}>
        {setupBlocked && (
          <Tooltip label={setupBlocked}>
            <span className={styles.mock} data-testid="setup-incomplete-marker">
              Setup incomplete
            </span>
          </Tooltip>
        )}
        {mockMode && (
          <Tooltip label="Recording or the final pass is simulated. Start the app with scripts/m1.sh to record real meetings.">
            <span className={styles.mock} data-testid="mock-backend-marker">
              Mock backend
            </span>
          </Tooltip>
        )}
        {processingText && (
          <span
            className={styles.lag}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="background-processing-status"
          >
            {processingText}
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
          <Tooltip label="Show the small recording window again">
            <button
              type="button"
              className={styles.showMini}
              onClick={() => void backend.call('showMiniWindow').catch(() => undefined)}
            >
              Show mini window
            </button>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
