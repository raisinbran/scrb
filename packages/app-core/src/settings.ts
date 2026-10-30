import { isValidRequest, type AppSettings, type SettingsPatch } from '@scrb/contracts';
import type { AutoDeleteScope, AutoDeleteSettings } from '@scrb/storage';

/** The part of `SettingsStore` these handlers use. */
export interface SettingsBackingStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  getAutoDelete(): AutoDeleteSettings;
  setAutoDelete(settings: AutoDeleteSettings): void;
}

type ContractScope = AppSettings['autoDelete']['scope'];

const APP_SETTINGS_KEY = 'app.settings';

const TO_CONTRACT_SCOPE: Record<AutoDeleteScope, ContractScope> = {
  audio: 'audioOnly',
  meeting: 'wholeMeeting',
};

const TO_STORED_SCOPE: Record<ContractScope, AutoDeleteScope> = {
  audioOnly: 'audio',
  wholeMeeting: 'meeting',
};

const DEFAULTS: Omit<AppSettings, 'storageLocation' | 'autoDelete'> = {
  audio: {
    micDeviceId: null,
    meetingAppId: 'whole-computer',
    preset: 'voiceIsolation',
    inputSensitivityDb: 'auto',
    noiseSuppression: 'strong',
    echoCancellation: true,
    automaticGainControl: true,
    advancedVoiceActivity: true,
    bypassSystemInputProcessing: false,
    noAudioWarning: true,
    deviceSuggestions: true,
  },
  transcriptionQuality: 'balanced',
  summaryDefaultLength: 'brief',
  location: { country: null, usState: null },
  theme: 'system',
  transcriptFontPx: 15,
};

function merged(saved: SettingsPatch, patch: SettingsPatch): SettingsPatch {
  return {
    ...saved,
    ...patch,
    ...(saved.audio || patch.audio ? { audio: { ...saved.audio, ...patch.audio } } : {}),
    ...(saved.location || patch.location
      ? { location: { ...saved.location, ...patch.location } }
      : {}),
  };
}

export function createSettingsHandlers(store: SettingsBackingStore, storageLocation: string) {
  /** A saved value that fails the request checks is damaged, so the defaults stand in for it. */
  const readSaved = (): SettingsPatch => {
    const saved = store.get<unknown>(APP_SETTINGS_KEY, {});
    return isValidRequest('updateSettings', saved) ? saved : {};
  };

  const getSettings = (): AppSettings => {
    const { period, scope } = store.getAutoDelete();
    const saved = readSaved();
    return {
      ...DEFAULTS,
      ...saved,
      audio: { ...DEFAULTS.audio, ...saved.audio },
      location: { ...DEFAULTS.location, ...saved.location },
      autoDelete: { period, scope: TO_CONTRACT_SCOPE[scope] },
      storageLocation,
    };
  };

  const updateSettings = (patch: SettingsPatch): AppSettings => {
    // The library's location moves only through `pickStorageLocation`; auto-delete has its own key.
    const { autoDelete, ...rest } = patch;
    delete rest.storageLocation;
    if (autoDelete) {
      const current = getSettings().autoDelete;
      const next = { ...current, ...autoDelete };
      store.setAutoDelete({ period: next.period, scope: TO_STORED_SCOPE[next.scope] });
    }
    store.set(APP_SETTINGS_KEY, merged(readSaved(), rest));
    return getSettings();
  };

  return { getSettings, updateSettings };
}
