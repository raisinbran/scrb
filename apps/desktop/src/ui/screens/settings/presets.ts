import type { AudioPreset, AudioSettings } from '@scrb/contracts';

export type PresetControls = Pick<
  AudioSettings,
  'noiseSuppression' | 'echoCancellation' | 'automaticGainControl' | 'bypassSystemInputProcessing'
>;

// Sent with the preset, so the toggles show the truth without waiting on the backend.
const PRESET_CONTROLS: Record<Exclude<AudioPreset, 'custom'>, PresetControls> = {
  voiceIsolation: {
    noiseSuppression: 'strong',
    echoCancellation: true,
    automaticGainControl: true,
    bypassSystemInputProcessing: false,
  },
  studio: {
    noiseSuppression: 'off',
    echoCancellation: false,
    automaticGainControl: false,
    bypassSystemInputProcessing: true,
  },
};

export const PRESET_OPTIONS: { value: AudioPreset; label: string; description: string }[] = [
  {
    value: 'voiceIsolation',
    label: 'Voice Isolation',
    description:
      'Preset inactive for normal capture. Separately enabled experimental macOS AEC can still use echo cancellation.',
  },
  {
    value: 'studio',
    label: 'Studio',
    description:
      'Preset inactive for normal capture. Does not disable OS enhancements; saved settings opt out of experimental macOS AEC.',
  },
  {
    value: 'custom',
    label: 'Custom',
    description:
      'Preset inactive for normal capture. Saved echo and bypass settings can affect separately enabled experimental macOS AEC.',
  },
];

export function presetPatch(preset: AudioPreset): Partial<AudioSettings> {
  return preset === 'custom' ? { preset } : { preset, ...PRESET_CONTROLS[preset] };
}
