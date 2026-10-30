import { useId } from 'react';
import {
  WHOLE_COMPUTER_SOURCE_ID,
  type InputDevice,
  type MeetingApp,
  type SourceSelection,
} from '@scrb/contracts';
import styles from '../LiveScreen.module.css';

const WHOLE_COMPUTER: MeetingApp = {
  id: WHOLE_COMPUTER_SOURCE_ID,
  name: 'Whole computer audio',
  kind: 'wholeComputer',
  isRunning: true,
};

function withFallback(apps: MeetingApp[]): MeetingApp[] {
  return apps.some((app) => app.kind === 'wholeComputer') ? apps : [...apps, WHOLE_COMPUTER];
}

interface SourcePickersProps {
  devices: InputDevice[];
  apps: MeetingApp[];
  selection: SourceSelection;
  onSelect(selection: SourceSelection): void;
}

export function SourcePickers({ devices, apps, selection, onSelect }: SourcePickersProps) {
  const appId = useId();
  const micId = useId();
  const choices = withFallback(apps);
  const app = choices.find((item) => item.id === selection.meetingAppId) ?? WHOLE_COMPUTER;
  const mic = devices.find((device) => device.id === selection.micDeviceId);
  const defaultMic = devices.find((device) => device.isSystemDefault);

  return (
    <div className={styles.pickers}>
      <div className={styles.picker}>
        <label htmlFor={appId}>Meeting app</label>
        <select
          id={appId}
          value={app.id}
          onChange={(event) => onSelect({ ...selection, meetingAppId: event.target.value })}
        >
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.isRunning ? '' : ' (not running)'}
            </option>
          ))}
        </select>
        {!app.isRunning && (
          <p className={styles.hint}>
            {app.name} is not running.{' '}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onSelect({ ...selection, meetingAppId: WHOLE_COMPUTER_SOURCE_ID })}
            >
              Use Whole computer audio
            </button>
          </p>
        )}
        {app.kind === 'browser' && (
          <p className={styles.hint}>Records the entire browser, including other tabs.</p>
        )}
      </div>
      <div className={styles.picker}>
        <label htmlFor={micId}>Microphone</label>
        <select
          id={micId}
          value={selection.micDeviceId ?? ''}
          onChange={(event) => onSelect({ ...selection, micDeviceId: event.target.value || null })}
        >
          <option value="">System default{defaultMic ? ` (${defaultMic.name})` : ''}</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
        {(mic ?? defaultMic)?.transport === 'bluetoothHandsFree' && (
          <p className={styles.hint}>Hands-free Bluetooth lowers the audio quality.</p>
        )}
      </div>
    </div>
  );
}
