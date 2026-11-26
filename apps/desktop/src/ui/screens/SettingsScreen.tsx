import { cachedSources, fetchSources, forgetSources, sourcesNow } from '../lib/sources-cache.ts';
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
import { SettingsNav, type SettingsGroup } from './settings/SettingsNav.tsx';
import styles from './SettingsScreen.module.css';

const load = (backend: Backend) =>
  Promise.all([backend.call('getSettings'), sourcesNow(backend)]).then(
    ([settings, { devices, apps }]) => [settings, devices, apps] as const,
  );

// Kept across screens, so leaving Settings and coming back never loses an unsaved change.
const DRAFT_KEY = 'scrb.settings.draft';

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const QUALITY_OPTIONS: { value: TranscriptionQuality; label: string }[] = [
  { value: 'fast', label: 'Fast (no live text)' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'accurate', label: 'Best quality' },
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
  { value: 'audioOnly', label: 'Audio' },
  { value: 'wholeMeeting', label: 'Whole meeting' },
];

const GROUPS: SettingsGroup[] = [
  { id: 'settings-theme', label: 'Theme' },
  { id: 'settings-audio', label: 'Audio' },
  { id: 'settings-transcription', label: 'Transcription' },
  { id: 'settings-models', label: 'Models' },
  { id: 'settings-storage', label: 'Storage' },
  { id: 'settings-location', label: 'Location' },
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
    ? `The audio of meetings older than ${age} will be permanently deleted. Transcripts and summaries stay.`
    : `Meetings older than ${age} will be permanently deleted: the audio, the transcript, the summary and the exports.`;
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
  const storageLocation = initial.storageLocation;
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

  return (
    <div className={styles.layout}>
      <SettingsNav groups={GROUPS} />
      <div className={styles.groups}>
        <section className={styles.section} role="group" aria-labelledby="settings-theme">
          <h2 id="settings-theme" className={styles.legend}>
            Theme
          </h2>
          <div className={styles.themeOptions}>
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
          </div>
        </section>

        <AudioSection audio={draft.audio} devices={devices} apps={apps} onChange={changeAudio} />

        <section className={styles.section} aria-labelledby="settings-transcription">
          <h2 id="settings-transcription" className={styles.legend}>
            Transcription and summaries
          </h2>
          <div className={styles.fields}>
            <Select
              label="Performance"
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
          <p className={styles.help}>
            Fast turns live text off: the text appears after Stop. A change applies to the next
            recording. The final transcript is not affected by live text.
          </p>
        </section>

        <ModelsSection />

        <section className={styles.section} aria-labelledby="settings-storage">
          <h2 id="settings-storage" className={styles.legend}>
            Storage
          </h2>
          <div className={styles.inline}>
            <span className={styles.path}>{storageLocation}</span>
            <Button disabled aria-describedby="settings-storage-move-help">
              Change location…
            </Button>
          </div>
          <p id="settings-storage-move-help" className={styles.help}>
            Moving a saved library is not available yet. Your existing storage location is
            unchanged.
          </p>
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

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.saveDock}>
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
        </div>
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
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const backend = useBackend();
  const { state, reload } = useBackendData(load);
  // Lists shown from the cache are refreshed once behind the screen; the screen reloads only if they differ.
  useEffect(() => {
    const before = cachedSources();
    if (!before) return;
    let current = true;
    fetchSources(backend).then(
      (fresh) => {
        if (current && JSON.stringify(fresh) !== JSON.stringify(before)) reload();
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [backend, reload]);
  useEffect(
    () =>
      backend.on('deviceChanged', () => {
        forgetSources();
        reload();
      }),
    [backend, reload],
  );
  return (
    <Screen title="Settings" className={styles.screenWide ?? ''}>
      <DataView state={state}>
        {([settings, devices, apps]) => (
          <SettingsForm initial={settings} devices={devices} apps={apps} />
        )}
      </DataView>
    </Screen>
  );
}
