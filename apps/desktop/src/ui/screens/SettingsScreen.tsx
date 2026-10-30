import { useEffect, useState } from 'react';
import type {
  AppSettings,
  AudioSettings,
  AutoDeletePeriod,
  AutoDeleteScope,
  Backend,
  InputDevice,
  MeetingApp,
  SummaryLength,
  ThemeSetting,
  TranscriptionQuality,
} from '@scrb/contracts';
import { Button } from '../components/Button.tsx';
import { ActionDialog } from '../components/Dialog.tsx';
import { LocationField } from '../components/LocationField.tsx';
import { useBackend } from '../lib/backend-context.tsx';
import { readStored, writeStored } from '../lib/stored-value.ts';
import { useAction } from '../lib/use-action.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { DataView, Screen } from './Screen.tsx';
import { AudioSection } from './settings/AudioSection.tsx';
import { ModelsSection } from './settings/ModelsSection.tsx';
import styles from './SettingsScreen.module.css';

const load = (backend: Backend) =>
  Promise.all([
    backend.call('getSettings'),
    backend.call('listInputDevices'),
    backend.call('listMeetingApps'),
  ]);

// Kept across screens, so leaving Settings and coming back never loses an unsaved change.
const DRAFT_KEY = 'scrb.settings.draft';

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const QUALITY_OPTIONS: { value: TranscriptionQuality; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'accurate', label: 'Accurate' },
];

const LENGTH_OPTIONS: { value: SummaryLength; label: string }[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'full', label: 'Full' },
];

const PERIOD_OPTIONS: { value: AutoDeletePeriod; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' },
  { value: '1y', label: '1 year' },
];

const SCOPE_OPTIONS: { value: AutoDeleteScope; label: string }[] = [
  { value: 'audioOnly', label: 'Audio only' },
  { value: 'wholeMeeting', label: 'The whole meeting' },
];

type Draft = Pick<
  AppSettings,
  'audio' | 'transcriptionQuality' | 'summaryDefaultLength' | 'autoDelete' | 'location'
>;

const draftOf = ({
  audio,
  transcriptionQuality,
  summaryDefaultLength,
  autoDelete,
  location,
}: AppSettings): Draft => ({
  audio,
  transcriptionQuality,
  summaryDefaultLength,
  autoDelete,
  location,
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function autoDeleteSentence({ period, scope }: Draft['autoDelete']): string {
  const age = PERIOD_OPTIONS.find((option) => option.value === period)?.label.toLowerCase();
  return scope === 'audioOnly'
    ? `Audio from meetings older than ${age} will be deleted. Transcripts and summaries stay.`
    : `Meetings older than ${age} will be deleted in full, including transcripts and summaries.`;
}

function Select<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange(value: T): void;
}) {
  return (
    <label className={styles.field}>
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingsForm({
  initial,
  devices,
  apps,
}: {
  initial: AppSettings;
  devices: InputDevice[];
  apps: MeetingApp[];
}) {
  const backend = useBackend();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(draftOf(initial));
  const [storageLocation, setStorageLocation] = useState(initial.storageLocation);
  const [draft, setDraft] = useState(() => readStored<Draft>(DRAFT_KEY) ?? draftOf(initial));
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();
  const dirty = !sameDraft(draft, saved);

  const change = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    writeStored(DRAFT_KEY, next);
  };
  const changeAudio = (patch: Partial<AudioSettings>) =>
    change({ audio: { ...draft.audio, ...patch } });
  const changeAutoDelete = (patch: Partial<Draft['autoDelete']>) =>
    change({ autoDelete: { ...draft.autoDelete, ...patch } });

  const discard = () => {
    setDraft(saved);
    writeStored(DRAFT_KEY, null);
  };

  const commit = async () => {
    const settings = await backend.call('updateSettings', draft);
    setSaved(draftOf(settings));
    setDraft(draftOf(settings));
    writeStored(DRAFT_KEY, null);
    setConfirming(false);
  };

  const save = () => {
    const autoDeleteChanged = JSON.stringify(draft.autoDelete) !== JSON.stringify(saved.autoDelete);
    if (autoDeleteChanged && draft.autoDelete.period !== 'never') setConfirming(true);
    else void run(commit);
  };

  const pickStorage = () =>
    void run(async () => {
      const settings = await backend.call('pickStorageLocation');
      setStorageLocation(settings.storageLocation);
    });

  return (
    <>
      <AudioSection audio={draft.audio} devices={devices} apps={apps} onChange={changeAudio} />

      <section className={styles.section} aria-labelledby="settings-transcription">
        <h2 id="settings-transcription" className={styles.legend}>
          Transcription and summaries
        </h2>
        <div className={styles.fields}>
          <Select
            label="Transcription quality"
            value={draft.transcriptionQuality}
            options={QUALITY_OPTIONS}
            onChange={(transcriptionQuality) => change({ transcriptionQuality })}
          />
          <Select
            label="Summary default length"
            value={draft.summaryDefaultLength}
            options={LENGTH_OPTIONS}
            onChange={(summaryDefaultLength) => change({ summaryDefaultLength })}
          />
        </div>
      </section>

      <ModelsSection />

      <section className={styles.section} aria-labelledby="settings-storage">
        <h2 id="settings-storage" className={styles.legend}>
          Storage
        </h2>
        <div className={styles.inline}>
          <span className={styles.path}>{storageLocation}</span>
          <Button disabled={busy} onClick={pickStorage}>
            Change location…
          </Button>
        </div>
        <div className={styles.fields}>
          <Select
            label="Auto-delete meetings after"
            value={draft.autoDelete.period}
            options={PERIOD_OPTIONS}
            onChange={(period) => changeAutoDelete({ period })}
          />
          <Select
            label="What to delete"
            value={draft.autoDelete.scope}
            options={SCOPE_OPTIONS}
            disabled={draft.autoDelete.period === 'never'}
            onChange={(scope) => changeAutoDelete({ scope })}
          />
        </div>
        {draft.autoDelete.period !== 'never' && (
          <p className={styles.help}>{autoDeleteSentence(draft.autoDelete)}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="settings-location">
        <h2 id="settings-location" className={styles.legend}>
          Location for the privacy banner
        </h2>
        <LocationField value={draft.location} onChange={(location) => change({ location })} />
      </section>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Theme</legend>
        {THEME_OPTIONS.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {dirty && (
        <div className={styles.saveBar} role="status">
          <span>You have unsaved changes.</span>
          <div className={styles.actions}>
            <Button disabled={busy} onClick={discard}>
              Discard
            </Button>
            <Button variant="primary" disabled={busy} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      )}
      {confirming && (
        <ActionDialog
          title="Turn on auto-delete?"
          confirmLabel="Save and turn on"
          danger
          onConfirm={commit}
          onCancel={() => setConfirming(false)}
        >
          <p>{autoDeleteSentence(draft.autoDelete)} This cannot be undone.</p>
        </ActionDialog>
      )}
    </>
  );
}

export function SettingsScreen() {
  const backend = useBackend();
  const { state, reload } = useBackendData(load);
  useEffect(() => backend.on('deviceChanged', reload), [backend, reload]);
  return (
    <Screen title="Settings">
      <DataView state={state}>
        {([settings, devices, apps]) => (
          <SettingsForm initial={settings} devices={devices} apps={apps} />
        )}
      </DataView>
    </Screen>
  );
}
