import { useState } from 'react';
import type { PickedAudioFile } from '@scrb/contracts';
import { formatFileSize, formatMeetingDate } from '../../lib/format.ts';
import { IMPORT_STAGE_LABELS } from './labels.ts';
import { Modal } from './Modal.tsx';
import { useImports, type ImportEntry } from './import-tracker.ts';
import styles from './recordings.module.css';

interface ImportDialogProps {
  file: PickedAudioFile;
  onClose(): void;
}

export function ImportDialog({ file, onClose }: ImportDialogProps) {
  const { start } = useImports();
  const [buildVoiceProfiles, setBuildVoiceProfiles] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setStarting(true);
    setError(null);
    try {
      await start(file, buildVoiceProfiles);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The import could not start.');
      setStarting(false);
    }
  };

  return (
    <Modal title="Import audio file" onClose={onClose}>
      <p className={styles.fileName}>{file.fileName}</p>
      <p className={styles.muted}>
        {formatFileSize(file.sizeBytes)} · {formatMeetingDate(file.fileDate)}. The original file is
        not changed, and the meeting takes the file&apos;s date, which you can edit later.
      </p>
      <label className={styles.check}>
        <input
          type="checkbox"
          data-autofocus
          checked={buildVoiceProfiles}
          onChange={(event) => setBuildVoiceProfiles(event.target.checked)}
        />
        Build voice profiles from this file
      </label>
      <p className={styles.muted}>
        Off by default, because this file may hold voices of people who did not expect to be
        profiled. Existing profiles can still suggest names either way.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.modalActions}>
        <button type="button" className={styles.button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={starting}
          onClick={() => void submit()}
        >
          {starting ? 'Starting…' : 'Import'}
        </button>
      </div>
    </Modal>
  );
}

function ImportRow({ entry, onOpen }: { entry: ImportEntry; onOpen(id: string): void }) {
  const { tracker, start } = useImports();
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setError(null);
    tracker.cancel(entry.importId).catch((failure: Error) => setError(failure.message));
  };
  const retry = async () => {
    if (!entry.source) return;
    setError(null);
    try {
      await start(entry.source.file, entry.source.buildVoiceProfiles);
      tracker.dismiss(entry.importId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The import could not start.');
    }
  };
  const canRetry =
    entry.state === 'failed' &&
    entry.source !== null &&
    entry.reason !== 'unreadable' &&
    entry.reason !== 'unsupportedFormat';

  return (
    <li className={styles.importRow}>
      <div className={styles.importBody}>
        <span className={styles.fileName}>{entry.fileName}</span>
        {entry.state === 'running' && (
          <>
            <span className={styles.muted}>
              {entry.cancelling ? 'Cancelling…' : IMPORT_STAGE_LABELS[entry.stage]}
            </span>
            <progress
              className={styles.progress}
              aria-label={`Importing ${entry.fileName}`}
              max={1}
              value={entry.fraction}
            />
          </>
        )}
        {entry.state === 'finished' && <span className={styles.muted}>Imported</span>}
        {entry.state === 'failed' && (
          <span role="alert" className={styles.dangerText}>
            {entry.message} No meeting was created.
          </span>
        )}
        {error && <span role="alert">{error}</span>}
      </div>
      {entry.state === 'running' && (
        <button
          type="button"
          className={styles.button}
          disabled={entry.cancelling}
          aria-label={`Cancel import of ${entry.fileName}`}
          onClick={cancel}
        >
          Cancel
        </button>
      )}
      {entry.state === 'finished' && (
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            tracker.dismiss(entry.importId);
            onOpen(entry.meetingId);
          }}
        >
          Open
        </button>
      )}
      {canRetry && (
        <button type="button" className={styles.button} onClick={() => void retry()}>
          Try again
        </button>
      )}
      {entry.state !== 'running' && (
        <button
          type="button"
          className={styles.button}
          aria-label={`Dismiss ${entry.fileName}`}
          onClick={() => tracker.dismiss(entry.importId)}
        >
          Dismiss
        </button>
      )}
    </li>
  );
}

export function ImportPanel({ onOpen }: { onOpen(id: string): void }) {
  const { entries } = useImports();
  if (entries.length === 0) return null;
  return (
    <section aria-label="Imports">
      <ul className={styles.imports}>
        {entries.map((entry) => (
          <ImportRow key={entry.importId} entry={entry} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}
