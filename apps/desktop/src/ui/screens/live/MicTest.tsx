import { useEffect, useState } from 'react';
import type { AudioCheckStatus, InputDevice, SourceSelection } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { LevelMeters } from './LevelMeters.tsx';
import { useRecordingStatus } from '../../shell/use-recording-status.ts';
import styles from './MicTest.module.css';

const MIC_RESULT: Record<AudioCheckStatus['micResult'], string> = {
  listening: 'Listening…',
  hearing: 'We can hear you',
  quiet: 'Very quiet',
  noSignal: 'No sound from this mic',
  denied: 'Mic permission is off',
};

export function MicTest({
  sources,
  devices,
}: {
  sources: SourceSelection | null;
  devices: InputDevice[];
}) {
  const backend = useBackend();
  const [check, setCheck] = useState<AudioCheckStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { recording } = useRecordingStatus();
  const recordingNow = recording.status !== 'idle';

  useEffect(() => {
    const unsubscribe = backend.on('audioCheck', setCheck);
    return () => {
      unsubscribe();
      void backend.call('stopAudioCheck').catch(() => undefined);
    };
  }, [backend]);

  const active = check?.active === true;
  const chosen = sources?.micDeviceId
    ? (devices.find((device) => device.id === sources.micDeviceId) ??
      devices.find((device) => device.isSystemDefault))
    : devices.find((device) => device.isSystemDefault);
  const handsFree = chosen?.transport === 'bluetoothHandsFree';
  const showFailure = !active && check?.micResult === 'denied';
  const toggle = () => {
    if (active) void backend.call('stopAudioCheck');
    else if (sources) {
      setFailure(null);
      backend.call('startAudioCheck', { sources }).catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : 'The mic test could not start.');
      });
    }
  };

  return (
    <div className={styles.testRow}>
      <button
        type="button"
        className={styles.testButton}
        disabled={!sources || (recordingNow && !active)}
        onClick={toggle}
      >
        {active ? 'Stop test' : 'Test mic'}
      </button>
      <div className={styles.testMeter}>
        <LevelMeters active={active} micOnly />
      </div>
      <div className={styles.testNote}>
        {(active || handsFree || showFailure || recordingNow || failure) && (
          <span className={styles.hint} role="status">
            {recordingNow && !active
              ? 'Not available while recording.'
              : failure && !active
                ? failure
                : null}
            {check && (active || showFailure) ? MIC_RESULT[check.micResult] : null}
            {handsFree &&
              !recordingNow &&
              (active
                ? '. This headset is in call mode, so sound quality is lower.'
                : `${showFailure ? '. ' : ''}Testing this headset turns on call mode and may lower sound quality.`)}
          </span>
        )}
      </div>
    </div>
  );
}
