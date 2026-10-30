import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  ExportContent,
  ExportFinished,
  ExportFormat,
  MeetingDetail,
  MeetingSummaryDoc,
  SummaryExportOptions,
  SummaryLength,
  TranscriptExportOptions,
} from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { Modal } from './Modal.tsx';
import styles from './recordings.module.css';

const TRANSCRIPT_OPTIONS: [keyof TranscriptExportOptions, string][] = [
  ['title', 'Title'],
  ['date', 'Date'],
  ['duration', 'Duration'],
  ['speakerNames', 'Speaker names'],
  ['timestamps', 'Timestamps'],
  ['showCorrections', 'Show corrections'],
];

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange(value: T): void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={styles.check}>
          <input
            type="radio"
            name={legend}
            checked={option.value === value}
            disabled={option.disabled ?? false}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      {children}
    </fieldset>
  );
}

type Progress =
  | { step: 'choosing' }
  | { step: 'exporting' }
  | { step: 'done'; fileName: string }
  | { step: 'failed'; message: string };

interface ExportDialogProps {
  meeting: MeetingDetail;
  defaultLength: SummaryLength;
  onClose(): void;
}

export function ExportDialog({ meeting, defaultLength, onClose }: ExportDialogProps) {
  const backend = useBackend();
  const meetingId = meeting.id;
  const hasSummary = meeting.summaryState !== 'notGenerated';
  const [summary, setSummary] = useState<MeetingSummaryDoc | null>(null);
  const [content, setContent] = useState<ExportContent>('transcript');
  const [format, setFormat] = useState<ExportFormat>('docx');
  const [transcriptOptions, setTranscriptOptions] = useState<TranscriptExportOptions>({
    title: true,
    date: true,
    duration: true,
    speakerNames: true,
    timestamps: true,
    showCorrections: false,
  });
  const [summaryOptions, setSummaryOptions] = useState<SummaryExportOptions>({
    length: defaultLength,
    openQuestions: true,
    sourceTimestamps: true,
  });
  const [progress, setProgress] = useState<Progress>({ step: 'choosing' });
  const [folderError, setFolderError] = useState<string | null>(null);
  const exportId = useRef<string | null>(null);
  const early = useRef<ExportFinished[]>([]);

  useEffect(() => {
    if (!hasSummary) return;
    backend.call('getSummary', { meetingId }).then(setSummary, () => undefined);
  }, [backend, hasSummary, meetingId]);

  useEffect(() => {
    const finish = (event: ExportFinished) => {
      setProgress(
        event.ok
          ? { step: 'done', fileName: event.fileName }
          : { step: 'failed', message: event.message },
      );
    };
    return backend.on('exportFinished', (event) => {
      if (event.meetingId !== meetingId) return;
      if (exportId.current === event.exportId) finish(event);
      else early.current.push(event);
    });
  }, [backend, meetingId]);

  const lengthAvailable = (length: SummaryLength) =>
    summary === null || summary.narrative[length] !== null;
  const summaryLength = lengthAvailable(summaryOptions.length)
    ? summaryOptions.length
    : summaryOptions.length === 'brief'
      ? 'full'
      : 'brief';

  const start = async () => {
    setProgress({ step: 'exporting' });
    try {
      const response = await backend.call('exportMeeting', {
        meetingId,
        content,
        format,
        transcript: transcriptOptions,
        summary: { ...summaryOptions, length: summaryLength },
      });
      exportId.current = response.exportId;
      // The finished event can arrive before this response.
      const arrived = early.current.find((event) => event.exportId === response.exportId);
      if (arrived) {
        setProgress(
          arrived.ok
            ? { step: 'done', fileName: arrived.fileName }
            : { step: 'failed', message: arrived.message },
        );
      }
    } catch (failure) {
      setProgress({
        step: 'failed',
        message: failure instanceof Error ? failure.message : 'The export could not start.',
      });
    }
  };

  const openFolder = () => {
    setFolderError(null);
    backend
      .call('openMeetingFolder', { meetingId, folder: 'exports' })
      .catch(() => setFolderError('The folder could not be opened.'));
  };

  if (progress.step === 'exporting') {
    return (
      <Modal title="Export meeting">
        <p role="status">Exporting…</p>
        <progress className={styles.progress} aria-label="Export progress" />
      </Modal>
    );
  }

  if (progress.step === 'done') {
    return (
      <Modal title="Export meeting" onClose={onClose}>
        <p role="status">Saved {progress.fileName} in the meeting&apos;s exports folder.</p>
        {folderError && <p role="alert">{folderError}</p>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Close
          </button>
          <button type="button" data-autofocus className={styles.primary} onClick={openFolder}>
            Open folder
          </button>
        </div>
      </Modal>
    );
  }

  const usesTranscript = content !== 'summary';
  const usesSummary = content !== 'transcript';

  return (
    <Modal title="Export meeting" onClose={onClose}>
      {progress.step === 'failed' && (
        <p role="alert" className={styles.bannerDanger}>
          {progress.message}
        </p>
      )}
      <div className={styles.exportGrid}>
        <Choice<ExportContent>
          legend="Include"
          value={content}
          onChange={setContent}
          options={[
            { value: 'transcript', label: 'Transcript' },
            { value: 'summary', label: 'Summary', disabled: !hasSummary },
            { value: 'both', label: 'Both', disabled: !hasSummary },
          ]}
        />
        <Choice<ExportFormat>
          legend="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'docx', label: 'DOCX' },
            { value: 'pdf', label: 'PDF' },
          ]}
        />
        {usesTranscript && (
          <Group legend="Transcript options">
            {TRANSCRIPT_OPTIONS.map(([key, label]) => (
              <label key={key} className={styles.check}>
                <input
                  type="checkbox"
                  checked={transcriptOptions[key]}
                  onChange={(event) =>
                    setTranscriptOptions({ ...transcriptOptions, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </Group>
        )}
        {usesSummary && (
          <Group legend="Summary options">
            <Choice<SummaryLength>
              legend="Length"
              value={summaryLength}
              onChange={(length) => setSummaryOptions({ ...summaryOptions, length })}
              options={[
                { value: 'brief', label: 'Brief', disabled: !lengthAvailable('brief') },
                { value: 'full', label: 'Full', disabled: !lengthAvailable('full') },
              ]}
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={summaryOptions.openQuestions}
                onChange={(event) =>
                  setSummaryOptions({ ...summaryOptions, openQuestions: event.target.checked })
                }
              />
              Open questions
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={summaryOptions.sourceTimestamps}
                onChange={(event) =>
                  setSummaryOptions({ ...summaryOptions, sourceTimestamps: event.target.checked })
                }
              />
              Source timestamps
            </label>
            <p className={styles.muted}>Action-item and decision tables are always included.</p>
          </Group>
        )}
      </div>
      {!hasSummary && <p className={styles.muted}>Generate a summary to export it.</p>}
      <div className={styles.modalActions}>
        <button type="button" className={styles.button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          data-autofocus
          className={styles.primary}
          onClick={() => void start()}
        >
          {progress.step === 'failed' ? 'Try again' : 'Export'}
        </button>
      </div>
    </Modal>
  );
}
