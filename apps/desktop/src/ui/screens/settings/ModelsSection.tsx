import { useEffect, useRef, useState } from 'react';
import type {
  Backend,
  ModelDownloadFailure,
  ModelDownloadProgress,
  ModelInfo,
  ModelRole,
  ModelUpdate,
} from '@scrb/contracts';
import { Button } from '../../components/Button.tsx';
import { ActionDialog } from '../../components/Dialog.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { FOCUS_MODELS_EVENT, FOCUS_MODELS_KEY } from '../../lib/models-missing.tsx';
import { readStored, writeStored } from '../../lib/stored-value.ts';
import { useAction } from '../../lib/use-action.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView } from '../Screen.tsx';
import { Progress } from '../../components/Progress.tsx';
import styles from '../SettingsScreen.module.css';

const load = (backend: Backend) => backend.call('getSetupStatus');

const ROLE_LABELS: Record<ModelRole, string> = {
  liveSpeech: 'Live speech',
  finalSpeech: 'Final speech',
  speaker: 'Speaker',
  summary: 'Summary',
};

/** Free space the download keeps spare beyond the files themselves (the manager's margin). */
const SPARE_BYTES = 256 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

function progressText({ state, modelName, bytesDone, bytesTotal }: ModelDownloadProgress): string {
  if (state === 'verifying') return `Checking ${modelName}…`;
  const percent = bytesTotal > 0 ? Math.round((bytesDone / bytesTotal) * 100) : 0;
  return `Downloading ${modelName}: ${percent}% of ${formatSize(bytesTotal)}`;
}

/** What went wrong and what to do next, in plain words, for each reason the download can fail. */
export function failureText(
  reason: ModelDownloadFailure | undefined,
  remainingBytes: number,
  message: string | undefined,
): string {
  switch (reason) {
    case 'offline':
      return 'Could not reach the download server. Check your internet connection, then press Retry. Files already downloaded are kept.';
    case 'diskSpace':
      return `There is not enough free disk space. Free up about ${formatSize(remainingBytes + SPARE_BYTES)} on the drive that holds your Scribe data, then press Retry.`;
    case 'checksum':
      return 'A downloaded file did not match its expected checksum, so it was deleted. Press Retry to download it again. If it fails again, wait and try later: the file may have changed at its source.';
    default:
      return `${message ?? 'The download failed.'} Press Retry. If it keeps failing, try again later.`;
  }
}

type RunState =
  | { kind: 'idle'; cancelled: boolean }
  | { kind: 'running' }
  | { kind: 'failed'; reason: ModelDownloadFailure | undefined; message: string | undefined }
  | { kind: 'done'; message: string | undefined };

interface ModelRowProps {
  model: ModelInfo;
  update: ModelUpdate | undefined;
  progress: ModelDownloadProgress | undefined;
  disabled: boolean;
  /** The first-time download is in charge of this row; failures show above, not here. */
  downloading: boolean;
  onInstall(update: ModelUpdate): void;
  onRevert(model: ModelInfo): void;
}

function ModelRow({
  model,
  update,
  progress,
  disabled,
  downloading,
  onInstall,
  onRevert,
}: ModelRowProps) {
  const active = progress?.state === 'downloading' || progress?.state === 'verifying';
  return (
    <li className={styles.model}>
      <div className={styles.modelMain}>
        <div className={styles.modelText}>
          <span>{ROLE_LABELS[model.role]}</span>
          <span className={styles.help}>
            {model.installed
              ? `${model.name}, version ${model.version}, ${formatSize(model.sizeBytes)}`
              : `${model.name}, not downloaded yet (${formatSize(model.sizeBytes)})`}
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
          {model.installed && (
            <Button
              disabled={disabled || active}
              aria-label={`Revert ${ROLE_LABELS[model.role]} to previous model`}
              onClick={() => onRevert(model)}
            >
              Revert to previous model
            </Button>
          )}
        </div>
      </div>
      {active && (
        <div className={styles.progress} role="status">
          <span className={styles.help}>{progressText(progress)}</span>
          <Progress
            label={`${model.name} download`}
            fraction={
              progress.bytesTotal > 0 ? progress.bytesDone / progress.bytesTotal : undefined
            }
          />
        </div>
      )}
      {!downloading && progress?.state === 'failed' && (
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
  const [progress, setProgress] = useState<Record<string, ModelDownloadProgress>>({});
  const [overall, setOverall] = useState<{ done: number; total: number } | null>(null);
  const [run, setRun] = useState<RunState>({ kind: 'idle', cancelled: false });
  const [summaryRun, setSummaryRun] = useState<RunState>({ kind: 'idle', cancelled: false });
  const [confirming, setConfirming] = useState<ModelUpdate | null>(null);
  const { busy, error, run: act } = useAction();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // The notice's link comes here: scroll to this section once, then forget the request.
    // On mount it reads the key; while already mounted it hears the event.
    const consume = () => {
      if (readStored<boolean>(FOCUS_MODELS_KEY) !== true) return;
      writeStored(FOCUS_MODELS_KEY, null);
      heading.current?.scrollIntoView?.({ block: 'start' });
      heading.current?.focus?.({ preventScroll: true });
    };
    consume();
    window.addEventListener(FOCUS_MODELS_EVENT, consume);
    return () => window.removeEventListener(FOCUS_MODELS_EVENT, consume);
  }, []);

  useEffect(
    () =>
      backend.on('modelDownloadProgress', (event) => {
        setProgress((current) => ({ ...current, [event.modelName]: event }));
        if (event.role === 'summary') {
          setSummaryRun(
            event.state === 'failed'
              ? { kind: 'failed', reason: event.reason, message: event.message }
              : event.state === 'done'
                ? { kind: 'done', message: event.message }
                : { kind: 'running' },
          );
          if (event.state === 'done') reload();
          return;
        }
        // Only a download this section started moves the run; a model update's events do not.
        setRun((current) => {
          if (current.kind !== 'running') return current;
          if (event.state === 'failed')
            return { kind: 'failed', reason: event.reason, message: event.message };
          const last =
            event.state === 'done' &&
            event.overallBytesTotal !== undefined &&
            event.overallBytesDone === event.overallBytesTotal;
          return last ? { kind: 'done', message: event.message } : current;
        });
        if (event.overallBytesTotal !== undefined)
          setOverall({ done: event.overallBytesDone ?? 0, total: event.overallBytesTotal });
        if (event.state !== 'done') return;
        reload();
        void backend.call('checkModelUpdates').then(setUpdates, () => undefined);
      }),
    [backend, reload],
  );

  const check = () =>
    void act(async () => {
      setUpdates(await backend.call('checkModelUpdates'));
    });

  const install = (update: ModelUpdate) =>
    void act(() => backend.call('installModelUpdate', { role: update.role }));

  const revert = (model: ModelInfo) =>
    void act(async () => {
      await backend.call('revertModel', { role: model.role });
      reload();
      if (updates) setUpdates(await backend.call('checkModelUpdates'));
    });

  const download = () =>
    void act(async () => {
      setRun({ kind: 'running' });
      setProgress({});
      setOverall(null);
      try {
        await backend.call('startModelDownload');
      } catch (failure) {
        setRun({ kind: 'idle', cancelled: false });
        throw failure;
      }
    });

  const downloadSummary = () =>
    void act(async () => {
      setSummaryRun({ kind: 'running' });
      setProgress((current) => {
        const next = { ...current };
        for (const [name, event] of Object.entries(next)) {
          if (event.role === 'summary') delete next[name];
        }
        return next;
      });
      try {
        await backend.call('installModelUpdate', { role: 'summary' });
      } catch (failure) {
        setSummaryRun({
          kind: 'failed',
          reason: undefined,
          message: failure instanceof Error ? failure.message : undefined,
        });
      }
    });

  const cancel = () =>
    void act(async () => {
      await backend.call('cancelModelDownload');
      setRun({ kind: 'idle', cancelled: true });
      setProgress({});
      reload();
    });

  const cancelSummary = () =>
    void act(async () => {
      await backend.call('cancelModelDownload');
      setSummaryRun({ kind: 'idle', cancelled: true });
      setProgress((current) => {
        const next = { ...current };
        for (const [name, event] of Object.entries(next)) {
          if (event.role === 'summary') delete next[name];
        }
        return next;
      });
      reload();
    });

  return (
    <section className={styles.section} aria-labelledby="settings-models">
      <h2 id="settings-models" ref={heading} tabIndex={-1} className={styles.legend}>
        Models
      </h2>
      <DataView state={state}>
        {({ models }) => {
          const absent = models.filter((model) => model.role !== 'summary' && !model.installed);
          const summaryModel = models.find((model) => model.role === 'summary');
          const remaining = absent.reduce((sum, model) => sum + model.sizeBytes, 0);
          const needsDownload = absent.length > 0 || run.kind === 'running';
          const activeRequiredDownload =
            run.kind === 'running' ||
            Object.values(progress).some(
              (event) =>
                event.role !== 'summary' &&
                (event.state === 'downloading' || event.state === 'verifying'),
            );
          const summaryProgress = summaryModel ? progress[summaryModel.name] : undefined;
          const activeSummaryDownload =
            summaryRun.kind === 'running' ||
            summaryProgress?.state === 'downloading' ||
            summaryProgress?.state === 'verifying';
          return (
            <>
              {needsDownload && (
                <div className={styles.download}>
                  <p className={styles.help}>
                    Scribe needs {absent.length} more speech{' '}
                    {absent.length === 1 ? 'file' : 'files'} ({formatSize(remaining)}) before it can
                    record. They download once from the internet and stay on this computer.
                  </p>
                  {run.kind === 'running' && overall && (
                    <div className={styles.progress} role="status">
                      <span className={styles.help}>
                        Downloading models: {formatSize(overall.done)} of{' '}
                        {formatSize(overall.total)}
                      </span>
                      <Progress
                        label="Overall model download"
                        fraction={overall.total > 0 ? overall.done / overall.total : undefined}
                      />
                    </div>
                  )}
                  {run.kind === 'failed' && (
                    <p role="alert" className={styles.error}>
                      {failureText(run.reason, remaining, run.message)}
                    </p>
                  )}
                  {run.kind === 'idle' && run.cancelled && (
                    <p role="status" className={styles.help}>
                      Download cancelled. Files already finished are kept; press Download models to
                      continue.
                    </p>
                  )}
                  <div className={styles.inline}>
                    {run.kind === 'running' ? (
                      <Button disabled={busy || activeSummaryDownload} onClick={cancel}>
                        Cancel
                      </Button>
                    ) : run.kind === 'failed' ? (
                      <Button
                        variant="primary"
                        disabled={busy || activeRequiredDownload || activeSummaryDownload}
                        onClick={download}
                      >
                        Retry
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        disabled={busy || activeRequiredDownload || activeSummaryDownload}
                        onClick={download}
                      >
                        {`Download models (${formatSize(remaining)})`}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {run.kind === 'done' && (
                <p role="status" className={styles.help}>
                  {run.message ?? 'Models ready.'}
                </p>
              )}
              {summaryModel && (
                <ul className={styles.models}>
                  <li className={styles.model}>
                    <div className={styles.modelMain}>
                      <div className={styles.modelText}>
                        <span>Summaries (5.7 GB, optional)</span>
                        <span className={styles.help}>
                          {summaryModel.installed
                            ? 'Used to create summaries on this computer.'
                            : 'Download uses about 5.7 GB of disk space. This model is only needed to generate summaries.'}
                        </span>
                      </div>
                      <div className={styles.actions}>
                        {summaryModel.installed ? (
                          <span className={styles.help}>Installed</span>
                        ) : summaryRun.kind === 'done' ? (
                          <Button disabled>Installed</Button>
                        ) : activeSummaryDownload ? (
                          <Button
                            aria-label="Cancel summary model download"
                            disabled={busy || activeRequiredDownload}
                            onClick={cancelSummary}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            aria-label={
                              summaryRun.kind === 'failed'
                                ? 'Retry summary model download'
                                : 'Download summary model'
                            }
                            disabled={busy || activeRequiredDownload || activeSummaryDownload}
                            onClick={downloadSummary}
                          >
                            {summaryRun.kind === 'failed' ? 'Retry' : 'Download'}
                          </Button>
                        )}
                      </div>
                    </div>
                    {activeSummaryDownload && (
                      <div className={styles.progress} role="status">
                        <span className={styles.help}>
                          {summaryProgress
                            ? progressText(summaryProgress)
                            : 'Starting summary download…'}
                        </span>
                        <Progress
                          label="Summary model download"
                          fraction={
                            summaryProgress && summaryProgress.bytesTotal > 0
                              ? summaryProgress.bytesDone / summaryProgress.bytesTotal
                              : undefined
                          }
                        />
                      </div>
                    )}
                    {summaryRun.kind === 'failed' && (
                      <p role="alert" className={styles.error}>
                        {failureText(
                          summaryRun.reason,
                          Math.max(0, summaryModel.sizeBytes - (summaryProgress?.bytesDone ?? 0)),
                          summaryRun.message,
                        )}
                      </p>
                    )}
                    {summaryRun.kind === 'idle' && summaryRun.cancelled && (
                      <p role="status" className={styles.help}>
                        Download cancelled. Files already downloaded are kept; press Download to
                        continue.
                      </p>
                    )}
                    {summaryRun.kind === 'done' && (
                      <p role="status" className={styles.help}>
                        {summaryRun.message ?? 'Summary model installed.'}
                      </p>
                    )}
                  </li>
                </ul>
              )}
              <ul className={styles.models}>
                {models
                  .filter((model) => model.role !== 'summary')
                  .map((model) => (
                    <ModelRow
                      key={model.version + model.name}
                      model={model}
                      update={updates?.find((update) => update.role === model.role)}
                      progress={progress[model.name]}
                      disabled={busy || activeRequiredDownload || activeSummaryDownload}
                      downloading={needsDownload}
                      onInstall={(update) =>
                        update.invalidatesVoiceProfiles ? setConfirming(update) : install(update)
                      }
                      onRevert={revert}
                    />
                  ))}
              </ul>
            </>
          );
        }}
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
