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
      'Unavailable: suppression, echo cancellation and gain are not applied by this preset.',
  },
  {
    value: 'studio',
    label: 'Studio',
    description: 'Unavailable: does not turn off device processing.',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Unavailable: saved custom controls do not alter capture or recognition.',
  },
];

export function presetPatch(preset: AudioPreset): Partial<AudioSettings> {
  return preset === 'custom' ? { preset } : { preset, ...PRESET_CONTROLS[preset] };
}
