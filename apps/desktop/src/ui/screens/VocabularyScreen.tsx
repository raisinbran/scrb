import { useState } from 'react';
import type {
  Backend,
  VocabularyHistoryEntry,
  VocabularySuggestion,
  VocabularyTerm,
} from '@scrb/contracts';
import { Button } from '../components/Button.tsx';
import { ActionDialog } from '../components/Dialog.tsx';
import fieldStyles from '../components/Dialog.module.css';
import { useBackend } from '../lib/backend-context.tsx';
import { formatMeetingDate } from '../lib/format.ts';
import { useAction } from '../lib/use-action.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import list from '../components/ListItem.module.css';
import { DataView, EmptyState } from './Screen.tsx';
import { SplitLayout } from './SplitLayout.tsx';
import styles from './VocabularyScreen.module.css';

const load = async (backend: Backend) => {
  const [terms, suggestions] = await Promise.all([
    backend.call('listTerms'),
    backend.call('listVocabularySuggestions'),
  ]);
  return { terms, suggestions };
};

const HISTORY_LABELS: Record<VocabularyHistoryEntry['action'], string> = {
  created: 'Created',
  edited: 'Edited',
  disabled: 'Disabled',
  enabled: 'Enabled',
  misheardAdded: 'Misheard version added',
};

function EditDialog({
  term,
  onSaved,
  onCancel,
}: {
  term: VocabularyTerm;
  onSaved(): void;
  onCancel(): void;
}) {
  const backend = useBackend();
  const [spelling, setSpelling] = useState(term.term);
  const [misheard, setMisheard] = useState(term.misheard.join('\n'));
  const trimmed = spelling.trim();

  const save = async () => {
    const variants = misheard
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    await backend.call('updateTerm', {
      id: term.id,
      patch: { term: trimmed, misheard: [...new Set(variants)] },
    });
    onSaved();
  };

  return (
    <ActionDialog
      title="Edit term"
      confirmLabel="Save"
      disabled={trimmed === ''}
      onConfirm={save}
      onCancel={onCancel}
    >
      <label className={fieldStyles.field}>
        Correct spelling
        <input
          data-autofocus
          value={spelling}
          maxLength={300}
          onChange={(event) => setSpelling(event.target.value)}
        />
      </label>
      <label className={fieldStyles.field}>
        Misheard versions, one per line
        <textarea rows={4} value={misheard} onChange={(event) => setMisheard(event.target.value)} />
      </label>
    </ActionDialog>
  );
}

type Entry =
  | {
      kind: 'suggestion';
      key: string;
      name: string;
      misheard: string[];
      item: VocabularySuggestion;
    }
  | { kind: 'term'; key: string; name: string; misheard: string[]; item: VocabularyTerm };

const matches = (entry: Entry, query: string) =>
  [entry.name, ...entry.misheard].some((text) => text.toLowerCase().includes(query));

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: Entry;
  selected: boolean;
  onSelect(): void;
}) {
  const tag = entry.kind === 'suggestion' ? 'Suggested' : entry.item.enabled ? null : 'Disabled';
  return (
    <li>
      <button
        type="button"
        className={`${list.item} ${styles.entry}`}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className={styles.term}>{entry.name}</span>
        {tag && <span className={styles.tag}>{tag}</span>}
      </button>
    </li>
  );
}

function HeardAs({ misheard }: { misheard: string[] }) {
  return (
    <div>
      <h3 className={styles.subheading}>Heard as</h3>
      {misheard.length > 0 ? (
        <ul className={styles.heard}>
          {misheard.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No misheard versions</p>
      )}
    </div>
  );
}

function TermPanel({
  term,
  busy,
  onEdit,
  onDelete,
  onToggle,
}: {
  term: VocabularyTerm;
  busy: boolean;
  onEdit(): void;
  onDelete(): void;
  onToggle(): void;
}) {
  return (
    <>
      <section aria-labelledby="vocab-term-name" className={styles.panel}>
        <h2 id="vocab-term-name" className={styles.name}>
          {term.term}
          {!term.enabled && <span className={styles.badge}>Disabled</span>}
        </h2>
        <HeardAs misheard={term.misheard} />
        <div className={styles.actions}>
          <Button aria-label={`Edit ${term.term}`} onClick={onEdit}>
            Edit
          </Button>
          <Button
            className={styles.toggleTerm}
            aria-label={`${term.enabled ? 'Disable' : 'Enable'} ${term.term}`}
            disabled={busy}
            onClick={onToggle}
          >
            {term.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="danger" aria-label={`Delete ${term.term}`} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </section>
      <section aria-labelledby="vocab-history" className={styles.panel}>
        <h3 id="vocab-history" className={styles.subheading}>
          History
        </h3>
        <ul className={styles.history}>
          {term.history.map((entry) => (
            <li key={`${entry.at}/${entry.action}/${entry.detail}`}>
              {formatMeetingDate(entry.at)}: {HISTORY_LABELS[entry.action]}. {entry.detail}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function SuggestionPanel({
  suggestion,
  busy,
  onAnswer,
}: {
  suggestion: VocabularySuggestion;
  busy: boolean;
  onAnswer(accepted: boolean): void;
}) {
  const { correctionCount, meetingCount } = suggestion;
  return (
    <section aria-labelledby="vocab-term-name" className={styles.panel}>
      <h2 id="vocab-term-name" className={styles.name}>
        {suggestion.term}
        <span className={styles.badge}>Suggested</span>
      </h2>
      <HeardAs misheard={suggestion.misheard.slice(0, 3)} />
      <p className={styles.muted}>
        {correctionCount} {correctionCount === 1 ? 'correction' : 'corrections'} in {meetingCount}{' '}
        {meetingCount === 1 ? 'meeting' : 'meetings'}
      </p>
      <div className={styles.actions}>
        <Button
          aria-label={`Remember ${suggestion.term}`}
          disabled={busy}
          onClick={() => onAnswer(true)}
        >
          Remember
        </Button>
        <Button
          aria-label={`Dismiss ${suggestion.term}`}
          disabled={busy}
          onClick={() => onAnswer(false)}
        >
          Dismiss
        </Button>
      </div>
    </section>
  );
}

function UsageNote({ terms }: { terms: VocabularyTerm[] }) {
  const enabled = terms.filter((term) => term.enabled).length;
  return (
    <p className={styles.note}>
      <strong>{enabled} enabled.</strong> Terms are saved but not used for transcription yet.
    </p>
  );
}

type Filter = 'all' | 'suggested' | 'enabled' | 'disabled';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'suggested', label: 'Suggested' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
];

const stateOf = (entry: Entry): Exclude<Filter, 'all'> =>
  entry.kind === 'suggestion' ? 'suggested' : entry.item.enabled ? 'enabled' : 'disabled';

const ORDER = { suggested: 0, enabled: 1, disabled: 2 } as const;

function FilterToggle({
  value,
  counts,
  onChange,
}: {
  value: Filter;
  counts: Record<Filter, number>;
  onChange(next: Filter): void;
}) {
  return (
    <div role="radiogroup" aria-label="Show terms" className={styles.filter}>
      {FILTERS.filter((item) => item.id === 'all' || counts[item.id] > 0 || item.id === value).map(
        (item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={value === item.id}
            className={styles.filterButton}
            onClick={() => onChange(item.id)}
          >
            {item.label} ({counts[item.id]})
          </button>
        ),
      )}
    </div>
  );
}

function Entries({
  entries,
  selectedKey,
  onSelect,
}: {
  entries: Entry[];
  selectedKey: string | null;
  onSelect(key: string): void;
}) {
  if (entries.length === 0) return <p className={styles.muted}>No matching terms.</p>;
  return (
    <ul className={list.list}>
      {entries.map((entry) => (
        <EntryRow
          key={entry.key}
          entry={entry}
          selected={entry.key === selectedKey}
          onSelect={() => onSelect(entry.key)}
        />
      ))}
    </ul>
  );
}

export function VocabularyScreen() {
  const backend = useBackend();
  const { state, reload } = useBackendData(load);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<VocabularyTerm | null>(null);
  const [deleting, setDeleting] = useState<VocabularyTerm | null>(null);
  const { busy, error, run } = useAction();

  const data = state.status === 'ready' ? state.data : null;
  const entries: Entry[] = data
    ? [
        ...data.suggestions.map((item): Entry => ({
          kind: 'suggestion',
          key: `suggestion:${item.id}`,
          name: item.term,
          misheard: item.misheard,
          item,
        })),
        ...data.terms.map((item): Entry => ({
          kind: 'term',
          key: `term:${item.id}`,
          name: item.term,
          misheard: item.misheard,
          item,
        })),
      ]
    : [];
  const needle = query.trim().toLowerCase();
  const shown = needle ? entries.filter((entry) => matches(entry, needle)) : entries;
  const counts: Record<Filter, number> = {
    all: shown.length,
    suggested: shown.filter((e) => stateOf(e) === 'suggested').length,
    enabled: shown.filter((e) => stateOf(e) === 'enabled').length,
    disabled: shown.filter((e) => stateOf(e) === 'disabled').length,
  };
  // Suggested first, then enabled, then disabled; the loaded order holds inside each state.
  const visible = shown
    .filter((e) => filter === 'all' || stateOf(e) === filter)
    .sort((x, y) => ORDER[stateOf(x)] - ORDER[stateOf(y)]);
  // Nothing picked (or the picked one is gone): show the first suggestion, else the first enabled term.
  const selected =
    entries.find((entry) => entry.key === selectedKey) ??
    entries.find((entry) => entry.kind === 'suggestion') ??
    entries.find((entry) => entry.kind === 'term' && entry.item.enabled) ??
    entries[0] ??
    null;

  const toggle = (term: VocabularyTerm) =>
    void run(async () => {
      await backend.call('updateTerm', { id: term.id, patch: { enabled: !term.enabled } });
      reload();
    });

  const answer = (suggestion: VocabularySuggestion, accepted: boolean) =>
    void run(async () => {
      try {
        await backend.call('answerVocabularySuggestion', { id: suggestion.id, accepted });
      } finally {
        reload();
      }
    });

  const remove = async (term: VocabularyTerm) => {
    await backend.call('deleteTerm', { id: term.id });
    setDeleting(null);
    reload();
  };

  return (
    <SplitLayout
      title="Vocabulary"
      header={
        data && entries.length > 0 ? (
          <>
            <input
              type="search"
              className={styles.search}
              aria-label="Search vocabulary"
              placeholder="Search terms and misheard versions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <FilterToggle value={filter} counts={counts} onChange={setFilter} />
            <UsageNote terms={data.terms} />
          </>
        ) : null
      }
      list={
        data && entries.length > 0 ? (
          <Entries
            entries={visible}
            selectedKey={selected?.key ?? null}
            onSelect={setSelectedKey}
          />
        ) : null
      }
    >
      <DataView state={state}>
        {() => (
          <div className={styles.content}>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {entries.length === 0 ? (
              <div className={styles.emptyPanel}>
                <EmptyState title="No terms yet">
                  Corrections you choose to remember will appear here.
                </EmptyState>
              </div>
            ) : selected?.kind === 'term' ? (
              <TermPanel
                term={selected.item}
                busy={busy}
                onEdit={() => setEditing(selected.item)}
                onDelete={() => setDeleting(selected.item)}
                onToggle={() => toggle(selected.item)}
              />
            ) : selected?.kind === 'suggestion' ? (
              <SuggestionPanel
                suggestion={selected.item}
                busy={busy}
                onAnswer={(accepted) => answer(selected.item, accepted)}
              />
            ) : null}
            {editing && (
              <EditDialog
                term={editing}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
                onCancel={() => setEditing(null)}
              />
            )}
            {deleting && (
              <ActionDialog
                title={`Delete ${deleting.term}?`}
                confirmLabel="Delete term"
                danger
                onConfirm={() => remove(deleting)}
                onCancel={() => setDeleting(null)}
              >
                <p>Later meetings will stop using this term. Past transcripts do not change.</p>
              </ActionDialog>
            )}
          </div>
        )}
      </DataView>
    </SplitLayout>
  );
}
