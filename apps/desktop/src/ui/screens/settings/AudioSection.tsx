import { cloneElement, Fragment, type ReactElement } from 'react';
import { IconButton } from '../../components/IconButton.tsx';
import type { AudioSettings, InputDevice, MeetingApp, NoiseSuppression } from '@scrb/contracts';
import { Tooltip } from '../../components/Tooltip.tsx';
import { MicTest } from '../live/MicTest.tsx';
import { PRESET_OPTIONS, type PresetControls } from './presets.ts';
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
    description:
      'Experimental macOS opt-in only; may duck other audio. No effect on normal capture.',
  },
  {
    key: 'automaticGainControl',
    label: 'Automatic gain control',
    description: 'Unavailable. This setting does not currently change microphone gain.',
  },
  {
    key: 'bypassSystemInputProcessing',
    label: 'Bypass system audio input processing',
    description: 'Experimental macOS opt-in only; prevents gated AEC. Does not bypass normal mic enhancements.',
  },
  {
    key: 'advancedVoiceActivity',
    label: 'Advanced voice activity',
    description: 'Unavailable. This setting does not currently change speech detection.',
  },
  {
    key: 'noAudioWarning',
    label: 'No audio detected warning',
    description: 'Unavailable. This setting does not currently enable silence warnings.',
  },
  {
    key: 'deviceSuggestions',
    label: 'Audio device suggestions',
    description: 'Unavailable. This setting does not currently enable device-change prompts.',
  },
];

const isPresetControl = (key: string): key is keyof PresetControls =>
  [
    'noiseSuppression',
    'echoCancellation',
    'automaticGainControl',
    'bypassSystemInputProcessing',
  ].includes(key);

const PRESET_TOGGLES = TOGGLES.filter(({ key }) => isPresetControl(key));
const OTHER_TOGGLES = TOGGLES.filter(({ key }) => !isPresetControl(key));
const isExperimentalAecControl = (key: string) =>
  key === 'echoCancellation' || key === 'bypassSystemInputProcessing';

interface AudioSectionProps {
  audio: AudioSettings;
  devices: InputDevice[];
  apps: MeetingApp[];
  onChange(patch: Partial<AudioSettings>): void;
}

const PRESET_TIP =
  'These profiles are saved preferences only; they do not currently change normal capture or speech recognition.';

export function AudioSection({ audio, devices, apps, onChange }: AudioSectionProps) {
  const systemDefault = devices.find((device) => device.isSystemDefault);
  const selectedMic =
    audio.micDeviceId === null
      ? systemDefault
      : devices.find((device) => device.id === audio.micDeviceId);
  const micMissing = audio.micDeviceId !== null && selectedMic === undefined;
  const sensitivity = audio.inputSensitivityDb;

  // Show saved preset ownership; all processing controls are unavailable until implemented.
  const locked = audio.preset !== 'custom';
  const lockedBy = PRESET_OPTIONS.find((option) => option.value === audio.preset)?.label;
  const lockTip = locked ? `Saved under ${lockedBy}; processing unavailable` : '';
  // Keep the existing tooltip focus behavior for disabled controls owned by a saved preset.
  // A disabled control cannot take focus, so its row does while locked: keyboard users reach the tip.
  const lockable = (
    key: string,
    node: ReactElement<{ 'aria-describedby'?: string; tabIndex?: number }>,
  ) => {
    const owned = locked && isPresetControl(key) && !isExperimentalAecControl(key);
    return (
      <Tooltip label={owned ? lockTip : ''}>
        {owned ? cloneElement(node, { tabIndex: 0 }) : node}
      </Tooltip>
    );
  };

  return (
    <section className={styles.section} aria-labelledby="settings-audio">
      <h2 id="settings-audio" className={styles.legend}>
        Audio
      </h2>
      <MicTest
        sources={{ micDeviceId: audio.micDeviceId, meetingAppId: audio.meetingAppId }}
        devices={devices}
      />
      <p id="audio-processing-unavailable" className={styles.help}>
        Audio processing profiles, noise suppression, gain, sensitivity and advanced detection
        are unavailable for normal recording. Their saved preferences remain visible but cannot be
        edited here. Echo cancellation and bypass remain editable because they affect an
        experimental macOS path only when separately opted in; they do not enable it on their own.
      </p>
      <fieldset className={styles.group}>
        <legend className={`${styles.groupLabel} ${styles.legendRow}`}>
          Input Profile
          <IconButton label="About presets" icon="info" tip={PRESET_TIP} />
        </legend>
        {PRESET_OPTIONS.map((option) => (
          <label key={option.value} className={styles.check}>
            <input
              type="radio"
              name="audio-preset"
              checked={audio.preset === option.value}
              disabled
              aria-describedby="audio-processing-unavailable"
            />
            <span>
              {option.label}
              <span className={styles.help}>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className={styles.fields}>
        {lockable(
          'noiseSuppression',
          <label className={styles.field}>
            Noise suppression
            <select
              disabled
              aria-describedby="audio-processing-unavailable"
              value={audio.noiseSuppression}
            >
              {NOISE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>,
        )}
        {PRESET_TOGGLES.map((toggle) => (
          <Fragment key={toggle.key}>
            {lockable(
              toggle.key,
              <label className={styles.check}>
                <input
                  type="checkbox"
                  disabled={!isExperimentalAecControl(toggle.key)}
                  aria-describedby="audio-processing-unavailable"
                  checked={audio[toggle.key]}
                  onChange={(event) => {
                    if (toggle.key === 'echoCancellation') {
                      onChange({ echoCancellation: event.target.checked, preset: 'custom' });
                    } else if (toggle.key === 'bypassSystemInputProcessing') {
                      onChange({
                        bypassSystemInputProcessing: event.target.checked,
                        preset: 'custom',
                      });
                    }
                  }}
                />
                <span>
                  {toggle.label}
                  <span className={styles.help}>{toggle.description}</span>
                </span>
              </label>,
            )}
          </Fragment>
        ))}
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="input-sensitivity">Input sensitivity</label>
          <div className={styles.slider}>
            <input
              id="input-sensitivity"
              type="range"
              min={-100}
              max={0}
              step={1}
              disabled
              aria-describedby="audio-processing-unavailable"
              value={sensitivity === 'auto' ? DEFAULT_SENSITIVITY_DB : sensitivity}
              aria-valuetext={sensitivity === 'auto' ? 'Automatic' : `${sensitivity} dB`}
            />
            <output>{sensitivity === 'auto' ? 'Automatic' : `${sensitivity} dB`}</output>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={sensitivity === 'auto'}
              disabled
              aria-describedby="audio-processing-unavailable"
            />
            <span>Automatic</span>
          </label>
          <p className={styles.help}>
            Unavailable. The saved threshold does not currently change speech detection or the original
            audio.
          </p>
        </div>
        {OTHER_TOGGLES.map((toggle) => (
          <Fragment key={toggle.key}>
            {lockable(
              toggle.key,
              <label className={styles.check}>
                <input
                  type="checkbox"
                  disabled
                  aria-describedby="audio-processing-unavailable"
                  checked={audio[toggle.key]}
                />
                <span>
                  {toggle.label}
                  <span className={styles.help}>{toggle.description}</span>
                </span>
              </label>,
            )}
          </Fragment>
        ))}
      </div>

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
    </section>
  );
}
