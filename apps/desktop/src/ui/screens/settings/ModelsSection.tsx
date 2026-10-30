import { useEffect, useState } from 'react';
import type {
  Backend,
  ModelDownloadProgress,
  ModelInfo,
  ModelRole,
  ModelUpdate,
} from '@scrb/contracts';
import { Button } from '../../components/Button.tsx';
import { ActionDialog } from '../../components/Dialog.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { useAction } from '../../lib/use-action.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView } from '../Screen.tsx';
import styles from '../SettingsScreen.module.css';

const load = (backend: Backend) => backend.call('getSetupStatus');

const ROLE_LABELS: Record<ModelRole, string> = {
  liveSpeech: 'Live speech',
  finalSpeech: 'Final speech',
  speaker: 'Speaker',
  summary: 'Summary',
};

function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

function progressText({ state, modelName, bytesDone, bytesTotal }: ModelDownloadProgress): string {
  if (state === 'verifying') return `Checking ${modelName}…`;
  const percent = bytesTotal > 0 ? Math.round((bytesDone / bytesTotal) * 100) : 0;
  return `Downloading ${modelName}: ${percent}% of ${formatSize(bytesTotal)}`;
}

interface ModelRowProps {
  model: ModelInfo;
  update: ModelUpdate | undefined;
  progress: ModelDownloadProgress | undefined;
  disabled: boolean;
  onInstall(update: ModelUpdate): void;
  onRevert(model: ModelInfo): void;
}

function ModelRow({ model, update, progress, disabled, onInstall, onRevert }: ModelRowProps) {
  const active = progress?.state === 'downloading' || progress?.state === 'verifying';
  return (
    <li className={styles.model}>
      <div className={styles.modelMain}>
        <div className={styles.modelText}>
          <span>{ROLE_LABELS[model.role]}</span>
          <span className={styles.help}>
            {model.name}, version {model.version}, {formatSize(model.sizeBytes)}
          </span>
          {update && !active && (
            <span className={styles.help}>
              Version {update.availableVersion} is available ({formatSize(update.sizeBytes)}).
            </span>
          )}
        </div>
        <div className={styles.actions}>
          {update && (
            <Button
              variant="primary"
              disabled={disabled || active}
              aria-label={`Install update for ${ROLE_LABELS[model.role]}`}
              onClick={() => onInstall(update)}
            >
              Install
            </Button>
          )}
          <Button
            disabled={disabled || active}
            aria-label={`Revert ${ROLE_LABELS[model.role]} to previous model`}
            onClick={() => onRevert(model)}
          >
            Revert to previous model
          </Button>
        </div>
      </div>
      {active && (
        <div className={styles.progress} role="status">
          <span className={styles.help}>{progressText(progress)}</span>
          <progress
            value={progress.bytesDone}
            max={progress.bytesTotal}
            aria-label={`${model.name} download`}
          />
        </div>
      )}
      {progress?.state === 'failed' && (
        <p role="alert" className={styles.error}>
          {progress.message ?? 'The download failed.'}
        </p>
      )}
    </li>
  );
}

/** Runs its actions at once: downloads and reverts are not part of the Save and Discard draft. */
export function ModelsSection() {
  const backend = useBackend();
  const { state, reload } = useBackendData(load);
  const [updates, setUpdates] = useState<ModelUpdate[] | null>(null);
  const [progress, setProgress] = useState<Partial<Record<ModelRole, ModelDownloadProgress>>>({});
  const [confirming, setConfirming] = useState<ModelUpdate | null>(null);
  const { busy, error, run } = useAction();

  useEffect(
    () =>
      backend.on('modelDownloadProgress', (event) => {
        setProgress((current) => ({ ...current, [event.role]: event }));
        if (event.state !== 'done') return;
        reload();
        void backend.call('checkModelUpdates').then(setUpdates, () => undefined);
      }),
    [backend, reload],
  );

  const check = () =>
    void run(async () => {
      setUpdates(await backend.call('checkModelUpdates'));
    });

  const install = (update: ModelUpdate) =>
    void run(() => backend.call('installModelUpdate', { role: update.role }));

  const revert = (model: ModelInfo) =>
    void run(async () => {
      await backend.call('revertModel', { role: model.role });
      reload();
      if (updates) setUpdates(await backend.call('checkModelUpdates'));
    });

  return (
    <section className={styles.section} aria-labelledby="settings-models">
      <h2 id="settings-models" className={styles.legend}>
        Models
      </h2>
      <DataView state={state}>
        {({ models }) => (
          <ul className={styles.models}>
            {models.map((model) => (
              <ModelRow
                key={model.role}
                model={model}
                update={updates?.find((update) => update.role === model.role)}
                progress={progress[model.role]}
                disabled={busy}
                onInstall={(update) =>
                  update.invalidatesVoiceProfiles ? setConfirming(update) : install(update)
                }
                onRevert={revert}
              />
            ))}
          </ul>
        )}
      </DataView>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.inline}>
        <Button disabled={busy} onClick={check}>
          Check for model updates
        </Button>
        {updates?.length === 0 && <span className={styles.help}>All models are up to date.</span>}
      </div>
      {confirming && (
        <ActionDialog
          title="This update affects voice profiles"
          confirmLabel="Install anyway"
          danger
          onConfirm={async () => {
            install(confirming);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        >
          <p>
            This speaker model cannot use your existing voice profiles. Returning speakers will not
            be recognized until profiles are rebuilt.
          </p>
        </ActionDialog>
      )}
    </section>
  );
}
