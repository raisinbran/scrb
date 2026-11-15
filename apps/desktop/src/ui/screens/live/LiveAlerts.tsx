import type {
  DeviceChange,
  RecordingHealth,
  RecordingWarning,
  RecordingWarningKind,
  TrackKind,
  TranscriptionLag,
} from '@scrb/contracts';
import { LAG_NOTICE_MS } from '../../lib/lag.ts';
import { formatElapsed } from '../../lib/format.ts';
import styles from '../LiveScreen.module.css';

const WARNING_TITLES: Record<RecordingWarningKind, string> = {
  micSilent: 'Mic silent',
  lowDisk: 'Low disk',
  deviceChanged: 'Device changed',
  permissionLost: 'Permission lost',
  audioMissing: 'Audio missing',
  bluetoothHandsFreeMic: 'Low-quality mic',
  meetingAppExited: 'Meeting app closed',
  pauseFailed: 'Recording ended',
};

/** What the person can do about each kind of warning. */
const WARNING_ADVICE: Record<RecordingWarningKind, string> = {
  micSilent: 'Check that the microphone is not muted and is the one selected above.',
  lowDisk: 'Free up disk space soon, or the recording may stop.',
  deviceChanged: 'Check which microphone is selected above.',
  permissionLost: 'Allow Scribe to record in your computer’s privacy settings.',
  audioMissing: 'Check that the meeting app is playing sound and is the one selected above.',
  bluetoothHandsFreeMic: 'Use a wired or built-in microphone for better quality.',
  meetingAppExited:
    'Only the microphone is being recorded now. Pick another app to capture its audio.',
  pauseFailed: 'Audio saved so far is kept.',
};

const TRACK_NAMES: Record<TrackKind, string> = {
  microphone: 'the microphone',
  meeting: 'the meeting audio',
};

function WarningBanner({ warning, failed }: { warning: RecordingWarning; failed: boolean }) {
  return (
    <div className={styles.banner} data-level={failed ? 'failed' : 'warning'} role="alert">
      <strong>{WARNING_TITLES[warning.kind]}.</strong> {warning.message}
      {warning.track && <> This affects {TRACK_NAMES[warning.track]}.</>}{' '}
      {WARNING_ADVICE[warning.kind]}
      {warning.atMs > 0 && <span className={styles.bannerTime}>{formatElapsed(warning.atMs)}</span>}
    </div>
  );
}

interface LiveAlertsProps {
  health: RecordingHealth | null;
  lag: TranscriptionLag | null;
  active: boolean;
  device: DeviceChange | null;
  error: string | null;
  onUseDevice(device: DeviceChange['device']): void;
  onDismissDevice(): void;
}

export function LiveAlerts(props: LiveAlertsProps) {
  const { health, lag, active, device, error } = props;
  return (
    <div className={styles.alerts}>
      {error && (
        <div className={styles.banner} data-level="failed" role="alert">
          {error}
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
          <strong>Live transcription stopped.</strong> No new text will appear here until it starts
          again.
        </div>
      )}
      {active && lag?.status === 'restarting' && (
        <div className={styles.banner} data-level="warning" role="alert">
          <strong>Live transcription is restarting.</strong> New text may be delayed.
        </div>
      )}
      {active && lag?.status === 'lagging' && lag.lagMs >= LAG_NOTICE_MS && (
        <div className={styles.banner} data-level="warning" role="status">
          <strong>Transcript is catching up.</strong> It is about {Math.round(lag.lagMs / 1000)}{' '}
          seconds behind.
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
