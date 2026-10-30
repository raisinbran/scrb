import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type {
  ActionItem,
  ActionStatus,
  Backend,
  DecisionItem,
  DecisionStatus,
  ImpactArea,
  MeetingDetail,
  MeetingSummaryDoc,
  NarrativeSection,
  OpenQuestion,
  SummaryItemUpdate,
  SummaryLength,
  SummaryProgress,
} from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { formatElapsed } from '../../lib/format.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView } from '../Screen.tsx';
import {
  ACTION_STATUS_LABELS,
  DECISION_STATUS_LABELS,
  IMPACT_LABELS,
  SUMMARY_STAGE_LABELS,
  isUnfinished,
} from './labels.ts';
import styles from './recordings.module.css';

function TimeLink({ ms, onPlay }: { ms: number; onPlay(ms: number): void }) {
  return (
    <button
      type="button"
      className={styles.timeLink}
      aria-label={`Play from ${formatElapsed(ms)}`}
      onClick={() => onPlay(ms)}
    >
      {formatElapsed(ms)}
    </button>
  );
}

function optionalText(value: string | null, unconfirmed: boolean): string {
  if (value === null) return unconfirmed ? 'Unconfirmed' : 'Not specified';
  return unconfirmed ? `${value} (unconfirmed)` : value;
}

interface Row {
  id: string;
  edited: boolean;
  needsReview: boolean;
  alsoAtMs: number[];
  sourceMs: number | null;
}

interface Column<T> {
  header: string;
  view(item: T): ReactNode;
  edit(draft: T, change: (next: T) => void, label: string): ReactNode;
}

function textColumn<T>(
  header: string,
  read: (item: T) => string,
  write: (item: T, value: string) => T,
): Column<T> {
  return {
    header,
    view: read,
    edit: (draft, change, label) => (
      <textarea
        className={styles.input}
        aria-label={label}
        rows={2}
        value={read(draft)}
        onChange={(event) => change(write(draft, event.target.value))}
      />
    ),
  };
}

function optionalColumn<T>(
  header: string,
  read: (item: T) => string | null,
  unconfirmed: (item: T) => boolean,
  write: (item: T, value: string | null) => T,
): Column<T> {
  return {
    header,
    view: (item) => optionalText(read(item), unconfirmed(item)),
    edit: (draft, change, label) => (
      <input
        className={styles.input}
        aria-label={label}
        placeholder="Not specified"
        value={read(draft) ?? ''}
        onChange={(event) =>
          change(write(draft, event.target.value.trim() ? event.target.value : null))
        }
      />
    ),
  };
}

function choiceColumn<T, V extends string>(
  header: string,
  labels: Record<V, string>,
  read: (item: T) => V | null,
  write: (item: T, value: V | null) => T,
  emptyLabel?: string,
): Column<T> {
  const entries = Object.entries(labels) as [V, string][];
  return {
    header,
    view: (item) => {
      const value = read(item);
      return value === null ? emptyLabel : labels[value];
    },
    edit: (draft, change, label) => (
      <select
        className={styles.input}
        aria-label={label}
        value={read(draft) ?? ''}
        onChange={(event) => change(write(draft, (event.target.value || null) as V | null))}
      >
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {entries.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    ),
  };
}

const ACTION_COLUMNS: Column<ActionItem>[] = [
  textColumn(
    'Action',
    (item) => item.action,
    (item, action) => ({ ...item, action }),
  ),
  optionalColumn(
    'Owner',
    (item) => item.owner,
    (item) => item.ownerUnconfirmed,
    (item, owner) => ({ ...item, owner, ownerUnconfirmed: false }),
  ),
  optionalColumn(
    'Deadline',
    (item) => item.deadline,
    (item) => item.deadlineUnconfirmed,
    (item, deadline) => ({ ...item, deadline, deadlineUnconfirmed: false }),
  ),
  choiceColumn<ActionItem, ActionStatus>(
    'Status',
    ACTION_STATUS_LABELS,
    (item) => item.status,
    (item, status) => ({ ...item, status: status ?? item.status }),
  ),
];

const DECISION_COLUMNS: Column<DecisionItem>[] = [
  textColumn(
    'Decision',
    (item) => item.decision,
    (item, decision) => ({ ...item, decision }),
  ),
  choiceColumn<DecisionItem, DecisionStatus>(
    'Status',
    DECISION_STATUS_LABELS,
    (item) => item.status,
    (item, status) => ({ ...item, status: status ?? item.status }),
  ),
  choiceColumn<DecisionItem, ImpactArea>(
    'Impact area',
    IMPACT_LABELS,
    (item) => item.impactArea,
    (item, impactArea) => ({ ...item, impactArea }),
    'Not specified',
  ),
];

const QUESTION_COLUMNS: Column<OpenQuestion>[] = [
  textColumn(
    'Question',
    (item) => item.question,
    (item, question) => ({ ...item, question }),
  ),
];

interface ItemTableProps<T extends Row> {
  title: string;
  empty: string;
  items: T[];
  columns: Column<T>[];
  mainText(item: T): string;
  onSave(item: T): Promise<void>;
  onPlay(ms: number): void;
}

function ItemTable<T extends Row>(props: ItemTableProps<T>) {
  const { title, empty, items, columns, mainText, onSave, onPlay } = props;
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setDraft(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.summarySection}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.header} scope="col">
                    {column.header}
                  </th>
                ))}
                <th scope="col">Source</th>
                <th scope="col">
                  <span className={styles.srOnly}>Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const editing = draft?.id === item.id;
                return (
                  <tr key={item.id}>
                    {columns.map((column, index) => (
                      <td key={column.header}>
                        {editing ? column.edit(draft, setDraft, column.header) : column.view(item)}
                        {index === 0 && !editing && (item.edited || item.needsReview) && (
                          <span className={styles.badges}>
                            {item.edited && <span className={styles.badge}>Edited</span>}
                            {item.needsReview && (
                              <span className={styles.badgeWarning}>Needs review</span>
                            )}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={styles.sourceCell}>
                      {item.sourceMs === null ? (
                        <span className={styles.muted}>None</span>
                      ) : (
                        <TimeLink ms={item.sourceMs} onPlay={onPlay} />
                      )}
                      {item.alsoAtMs.map((ms) => (
                        <TimeLink key={ms} ms={ms} onPlay={onPlay} />
                      ))}
                    </td>
                    <td className={styles.editCell}>
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className={styles.primary}
                            disabled={saving || !mainText(draft).trim()}
                            onClick={() => void save()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => {
                              setDraft(null);
                              setError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={draft !== null}
                          aria-label={`Edit: ${mainText(item)}`}
                          onClick={() => setDraft(item)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

interface NarrativeProps {
  section: NarrativeSection;
  onSave(section: NarrativeSection): Promise<void>;
}

function Narrative({ section, onSave }: NarrativeProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (draft === null) return;
    setError(null);
    try {
      await onSave({ ...section, text: draft });
      setDraft(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.');
    }
  };

  return (
    <div className={styles.narrative}>
      {section.heading && <h4 className={styles.narrativeHeading}>{section.heading}</h4>}
      {draft === null ? (
        <p className={styles.narrativeText}>{section.text}</p>
      ) : (
        <textarea
          className={styles.input}
          aria-label={section.heading ?? 'Summary text'}
          rows={6}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      <div className={styles.inlineActions}>
        {section.edited && draft === null && <span className={styles.badge}>Edited</span>}
        {draft === null ? (
          <button
            type="button"
            className={styles.button}
            aria-label={`Edit ${section.heading ?? 'summary text'}`}
            onClick={() => setDraft(section.text)}
          >
            Edit
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.primary}
              disabled={!draft.trim()}
              onClick={() => void save()}
            >
              Save
            </button>
            <button type="button" className={styles.button} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function LengthToggle({
  length,
  onChange,
}: {
  length: SummaryLength;
  onChange(length: SummaryLength): void;
}) {
  return (
    <div role="radiogroup" aria-label="Summary length" className={styles.segmented}>
      {(['brief', 'full'] as const).map((value) => (
        <label key={value} className={value === length ? styles.segmentOn : styles.segmentOff}>
          <input
            type="radio"
            className={styles.srOnly}
            name="summary-length"
            checked={value === length}
            onChange={() => onChange(value)}
          />
          {value === 'brief' ? 'Brief' : 'Full'}
        </label>
      ))}
    </div>
  );
}

interface SummaryTabProps {
  meeting: MeetingDetail;
  defaultLength: SummaryLength;
  onPlay(ms: number): void;
}

export function SummaryTab({ meeting, defaultLength, onPlay }: SummaryTabProps) {
  const backend = useBackend();
  const meetingId = meeting.id;
  const load = useCallback(
    (client: Backend) => client.call('getSummary', { meetingId }),
    [meetingId],
  );
  const { state, reload } = useBackendData(load);
  const [length, setLength] = useState(defaultLength);
  const [saved, setSaved] = useState<MeetingSummaryDoc | null>(null);
  const [progress, setProgress] = useState<SummaryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stops = [
      backend.on('summaryProgress', (event) => {
        if (event.meetingId !== meetingId) return;
        if (event.stage === 'failed') {
          setError(event.message ?? 'The summary could not be generated.');
          setProgress(null);
        } else if (event.stage === 'done') {
          setProgress(null);
          setSaved(null);
        } else {
          setProgress(event);
        }
        reload();
      }),
      backend.on('summaryOutdated', (event) => {
        if (event.meetingId !== meetingId) return;
        setSaved(null);
        reload();
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [backend, meetingId, reload]);

  const generate = async (target: SummaryLength) => {
    setError(null);
    setSaved(null);
    setLength(target);
    try {
      await backend.call('generateSummary', { meetingId, length: target });
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The summary could not be generated.');
    }
  };

  const saveItem = async (update: SummaryItemUpdate) => {
    setSaved(await backend.call('updateSummaryItem', { meetingId, update }));
  };

  const unfinished = isUnfinished(meeting.status);

  return (
    <div className={styles.summary}>
      {error && (
        <p role="alert" className={styles.bannerDanger}>
          {error}
        </p>
      )}
      <DataView state={state}>
        {(loaded) => {
          const doc = saved ?? loaded;
          const generating = doc.state === 'generating' || progress !== null;
          if (generating) {
            return (
              <div role="status" className={styles.generating}>
                <p className={styles.fileName}>
                  {progress ? SUMMARY_STAGE_LABELS[progress.stage] : 'Generating the summary'}
                </p>
                <progress
                  className={styles.progress}
                  aria-label="Summary progress"
                  max={1}
                  {...(progress ? { value: progress.fraction } : {})}
                />
                <p className={styles.muted}>
                  You can keep working. The summary appears here when it is ready.
                </p>
              </div>
            );
          }
          if (doc.state === 'notGenerated') {
            return (
              <div className={styles.generating}>
                <p className={styles.fileName}>No summary yet</p>
                <p className={styles.muted}>
                  {unfinished
                    ? 'A summary can be generated when the final pass is done.'
                    : 'Summaries are made on this computer from the finished transcript.'}
                </p>
                <div className={styles.inlineActions}>
                  <LengthToggle length={length} onChange={setLength} />
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={unfinished}
                    onClick={() => void generate(length)}
                  >
                    Generate Summary
                  </button>
                </div>
              </div>
            );
          }
          const sections = doc.narrative[length];
          return (
            <>
              {doc.state === 'outdated' && (
                <div className={styles.bannerWarning}>
                  <span>May be outdated — regenerate?</span>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => void generate(length)}
                  >
                    Regenerate
                  </button>
                </div>
              )}
              {doc.warnings.map((warning) => (
                <p key={warning} className={styles.bannerWarning}>
                  {warning}
                </p>
              ))}
              <div className={styles.summaryBar}>
                <LengthToggle length={length} onChange={setLength} />
                {doc.state === 'edited' && <span className={styles.badge}>Edited</span>}
                <span className={styles.spacer} />
                {doc.state !== 'outdated' && (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={unfinished}
                    title="Items you edited are kept"
                    onClick={() => void generate(length)}
                  >
                    Regenerate
                  </button>
                )}
              </div>
              <section className={styles.summarySection}>
                {sections ? (
                  sections.map((section) => (
                    <Narrative
                      key={section.id}
                      section={section}
                      onSave={(item) => saveItem({ kind: 'narrative', item })}
                    />
                  ))
                ) : (
                  <div className={styles.inlineActions}>
                    <span className={styles.muted}>
                      The {length === 'brief' ? 'Brief' : 'Full'} version has not been generated.
                    </span>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => void generate(length)}
                    >
                      Generate {length === 'brief' ? 'Brief' : 'Full'}
                    </button>
                  </div>
                )}
              </section>
              <ItemTable
                title="Action items"
                empty="No action items were found."
                items={doc.actionItems}
                columns={ACTION_COLUMNS}
                mainText={(item) => item.action}
                onSave={(item) => saveItem({ kind: 'actionItem', item })}
                onPlay={onPlay}
              />
              <ItemTable
                title="Decisions"
                empty="No decisions were found."
                items={doc.decisions}
                columns={DECISION_COLUMNS}
                mainText={(item) => item.decision}
                onSave={(item) => saveItem({ kind: 'decision', item })}
                onPlay={onPlay}
              />
              <ItemTable
                title="Open questions"
                empty="No open questions were found."
                items={doc.openQuestions}
                columns={QUESTION_COLUMNS}
                mainText={(item) => item.question}
                onSave={(item) => saveItem({ kind: 'openQuestion', item })}
                onPlay={onPlay}
              />
            </>
          );
        }}
      </DataView>
    </div>
  );
}
