import type { AudioSettings, InputDevice, MeetingApp, NoiseSuppression } from '@scrb/contracts';
import { PRESET_OPTIONS, presetPatch, type PresetControls } from './presets.ts';
import styles from '../SettingsScreen.module.css';

const DEFAULT_SENSITIVITY_DB = -40;

const NOISE_OPTIONS: { value: NoiseSuppression; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'standard', label: 'Standard' },
  { value: 'strong', label: 'Strong' },
];

type ToggleKey =
  | 'echoCancellation'
  | 'automaticGainControl'
  | 'advancedVoiceActivity'
  | 'bypassSystemInputProcessing'
  | 'noAudioWarning'
  | 'deviceSuggestions';

const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
  {
    key: 'echoCancellation',
    label: 'Echo cancellation',
    description: 'Stops your mic from re-transcribing remote voices when you are not on a headset.',
  },
  {
    key: 'automaticGainControl',
    label: 'Automatic gain control',
    description: 'Evens out your mic level for the transcriber.',
  },
  {
    key: 'bypassSystemInputProcessing',
    label: 'Bypass system audio input processing',
    description: 'Skips Windows or macOS mic enhancements.',
  },
  {
    key: 'advancedVoiceActivity',
    label: 'Advanced voice activity',
    description: 'Uses the transcriber’s own speech detection.',
  },
  {
    key: 'noAudioWarning',
    label: 'No audio detected warning',
    description: 'Warns you when a recording is silent.',
  },
  {
    key: 'deviceSuggestions',
    label: 'Audio device suggestions',
    description: 'Prompts when a new device is plugged in, including mid-meeting.',
  },
];

const isPresetControl = (key: string): key is keyof PresetControls =>
  [
    'noiseSuppression',
    'echoCancellation',
    'automaticGainControl',
    'bypassSystemInputProcessing',
  ].includes(key);

interface AudioSectionProps {
  audio: AudioSettings;
  devices: InputDevice[];
  apps: MeetingApp[];
  onChange(patch: Partial<AudioSettings>): void;
}

export function AudioSection({ audio, devices, apps, onChange }: AudioSectionProps) {
  const systemDefault = devices.find((device) => device.isSystemDefault);
  const selectedMic =
    audio.micDeviceId === null
      ? systemDefault
      : devices.find((device) => device.id === audio.micDeviceId);
  const micMissing = audio.micDeviceId !== null && selectedMic === undefined;
  const sensitivity = audio.inputSensitivityDb;

  const change = (patch: Partial<AudioSettings>) => {
    const leavesPreset = Object.keys(patch).some(isPresetControl);
    onChange(leavesPreset ? { ...patch, preset: 'custom' } : patch);
  };

  return (
    <section className={styles.section} aria-labelledby="settings-audio">
      <h2 id="settings-audio" className={styles.legend}>
        Audio
      </h2>
      <div className={styles.fields}>
        <label className={styles.field}>
          Microphone
          <select
            value={audio.micDeviceId ?? ''}
            onChange={(event) => onChange({ micDeviceId: event.target.value || null })}
          >
            <option value="">System default ({systemDefault?.name ?? 'none found'})</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
            {micMissing && (
              <option value={audio.micDeviceId ?? ''}>Selected microphone not connected</option>
            )}
          </select>
        </label>
        {selectedMic?.transport === 'bluetoothHandsFree' && (
          <p role="status" className={styles.warning}>
            This Bluetooth headset is in hands-free mode, which lowers its sound quality.
          </p>
        )}
        <label className={styles.field}>
          Meeting app
          <select
            value={audio.meetingAppId}
            onChange={(event) => onChange({ meetingAppId: event.target.value })}
          >
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.groupLabel}>Preset</legend>
        <p className={styles.help}>Presets change only the copy sent to the transcriber.</p>
        {PRESET_OPTIONS.map((option) => (
          <label key={option.value} className={styles.check}>
            <input
              type="radio"
              name="audio-preset"
              checked={audio.preset === option.value}
              onChange={() => onChange(presetPatch(option.value))}
            />
            <span>
              {option.label}
              <span className={styles.help}>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className={styles.fields}>
        <label className={styles.field}>
          Noise suppression
          <select
            value={audio.noiseSuppression}
            onChange={(event) =>
              change({ noiseSuppression: event.target.value as NoiseSuppression })
            }
          >
            {NOISE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.field}>
          <label htmlFor="input-sensitivity">Input sensitivity</label>
          <div className={styles.slider}>
            <input
              id="input-sensitivity"
              type="range"
              min={-100}
              max={0}
              step={1}
              disabled={sensitivity === 'auto'}
              value={sensitivity === 'auto' ? DEFAULT_SENSITIVITY_DB : sensitivity}
              aria-valuetext={sensitivity === 'auto' ? 'Automatic' : `${sensitivity} dB`}
              onChange={(event) => onChange({ inputSensitivityDb: Number(event.target.value) })}
            />
            <output>{sensitivity === 'auto' ? 'Automatic' : `${sensitivity} dB`}</output>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={sensitivity === 'auto'}
              onChange={(event) =>
                onChange({
                  inputSensitivityDb: event.target.checked ? 'auto' : DEFAULT_SENSITIVITY_DB,
                })
              }
            />
            <span>Automatic</span>
          </label>
          <p className={styles.help}>
            Sets what the transcriber treats as speech. It never cuts audio from the recording.
          </p>
        </div>
      </div>

      <div className={styles.toggles}>
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className={styles.check}>
            <input
              type="checkbox"
              checked={audio[toggle.key]}
              onChange={(event) => change({ [toggle.key]: event.target.checked })}
            />
            <span>
              {toggle.label}
              <span className={styles.help}>{toggle.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
