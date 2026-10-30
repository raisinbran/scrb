import type {
  DeviceChange,
  RecordingHealth,
  RecordingWarning,
  RecordingWarningKind,
  TranscriptionLag,
} from '@scrb/contracts';
import { formatElapsed } from '../../lib/format.ts';
import styles from '../LiveScreen.module.css';

const WARNING_TITLES: Record<RecordingWarningKind, string> = {
  micSilent: 'Mic silent',
  lowDisk: 'Low disk',
  deviceChanged: 'Device changed',
  permissionLost: 'Permission lost',
  audioMissing: 'Audio missing',
  bluetoothHandsFreeMic: 'Low-quality mic',
};

export function HealthIndicator({
  health,
  active,
}: {
  health: RecordingHealth | null;
  active: boolean;
}) {
  const level = active ? (health?.level ?? 'ok') : 'idle';
  const text = {
    idle: 'Recording: ready',
    ok: 'Recording: healthy',
    warning: 'Recording: needs attention',
    failed: 'Recording: failed',
  }[level];
  return (
    <span className={styles.indicator} data-level={level} data-testid="recording-health">
      {text}
    </span>
  );
}

function lagText(lag: TranscriptionLag | null): { text: string; level: string } {
  switch (lag?.status) {
    case 'ok':
      return { text: 'Transcript: live', level: 'ok' };
    case 'lagging':
      return {
        text: `Transcript: ${Math.round(lag.lagMs / 1000)} s behind`,
        level: 'warning',
      };
    case 'restarting':
      return { text: 'Transcript: restarting', level: 'warning' };
    case 'failed':
      return { text: 'Transcript: stopped', level: 'failed' };
    case 'off':
    default:
      return { text: 'Transcript: off', level: 'idle' };
  }
}

export function LagIndicator({ lag, active }: { lag: TranscriptionLag | null; active: boolean }) {
  const { text, level } = lagText(active ? lag : null);
  return (
    <span className={styles.indicator} data-level={level} data-testid="transcript-lag">
      {text}
    </span>
  );
}

function WarningBanner({ warning, failed }: { warning: RecordingWarning; failed: boolean }) {
  return (
    <div className={styles.banner} data-level={failed ? 'failed' : 'warning'} role="alert">
      <strong>{WARNING_TITLES[warning.kind]}.</strong> {warning.message}
      {warning.atMs > 0 && <span className={styles.bannerTime}>{formatElapsed(warning.atMs)}</span>}
    </div>
  );
}

interface LiveAlertsProps {
  health: RecordingHealth | null;
  lag: TranscriptionLag | null;
  active: boolean;
  privacyBanner: boolean;
  device: DeviceChange | null;
  error: string | null;
  onUseDevice(device: DeviceChange['device']): void;
  onDismissDevice(): void;
  onDismissPrivacy(): void;
}

export function LiveAlerts(props: LiveAlertsProps) {
  const { health, lag, active, privacyBanner, device, error } = props;
  return (
    <div className={styles.alerts}>
      {error && (
        <div className={styles.banner} data-level="failed" role="alert">
          {error}
        </div>
      )}
      {privacyBanner && (
        <div className={styles.banner} data-level="info" role="status">
          Voice profiles are being built for this recording.
          <button type="button" className={styles.linkButton} onClick={props.onDismissPrivacy}>
            Dismiss
          </button>
        </div>
      )}
      {active &&
        health?.warnings.map((warning) => (
          <WarningBanner
            key={`${warning.kind}-${warning.atMs}`}
            warning={warning}
            failed={health.level === 'failed'}
          />
        ))}
      {active && health?.level === 'failed' && health.warnings.length === 0 && (
        <div className={styles.banner} data-level="failed" role="alert">
          Recording has failed. Audio saved so far is kept.
        </div>
      )}
      {active && lag?.status === 'failed' && (
        <div className={styles.banner} data-level="warning" role="alert">
          <strong>Live transcription stopped.</strong> Your recording is still running and is not
          affected.
        </div>
      )}
      {device && <DeviceNotice {...props} device={device} />}
    </div>
  );
}

function DeviceNotice({
  device,
  onUseDevice,
  onDismissDevice,
}: Pick<LiveAlertsProps, 'onUseDevice' | 'onDismissDevice'> & { device: DeviceChange }) {
  const name = device.device.name;
  const text = device.fallbackDevice
    ? `${name} is gone. Now using ${device.fallbackDevice.name}.`
    : device.kind === 'removed'
      ? `${name} was disconnected.`
      : device.kind === 'defaultChanged'
        ? `The system default microphone is now ${name}.`
        : `${name} was connected.`;
  return (
    <div className={styles.banner} data-level="warning" role="status">
      <strong>Device changed.</strong> {text}
      {device.suggestSwitch && (
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => onUseDevice(device.device)}
        >
          Use {name}
        </button>
      )}
      <button type="button" className={styles.linkButton} onClick={onDismissDevice}>
        Dismiss
      </button>
    </div>
  );
}
