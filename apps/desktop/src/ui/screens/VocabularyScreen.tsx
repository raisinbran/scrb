import { useState } from 'react';
import type { Backend, VocabularyHistoryEntry, VocabularyTerm } from '@scrb/contracts';
import { Button } from '../components/Button.tsx';
import { ActionDialog } from '../components/Dialog.tsx';
import fieldStyles from '../components/Dialog.module.css';
import { useBackend } from '../lib/backend-context.tsx';
import { formatMeetingDate } from '../lib/format.ts';
import { useAction } from '../lib/use-action.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, EmptyState, Screen } from './Screen.tsx';
import styles from './VocabularyScreen.module.css';

const load = (backend: Backend) => backend.call('listTerms');

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

function TermRow({
  term,
  onEdit,
  onDelete,
  onToggle,
  toggleDisabled,
}: {
  term: VocabularyTerm;
  onEdit(): void;
  onDelete(): void;
  onToggle(): void;
  toggleDisabled: boolean;
}) {
  return (
    <li className={term.enabled ? styles.row : `${styles.row} ${styles.disabled}`}>
      <div className={styles.main}>
        <div className={styles.text}>
          <span className={styles.term}>
            {term.term}
            {!term.enabled && <span className={styles.badge}>Disabled</span>}
          </span>
          <span className={styles.muted}>
            {term.misheard.length > 0
              ? `Heard as: ${term.misheard.join(', ')}`
              : 'No misheard versions'}
          </span>
        </div>
        <div className={styles.actions}>
          <Button aria-label={`Edit ${term.term}`} onClick={onEdit}>
            Edit
          </Button>
          <Button
            aria-label={`${term.enabled ? 'Disable' : 'Enable'} ${term.term}`}
            disabled={toggleDisabled}
            onClick={onToggle}
          >
            {term.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="danger" aria-label={`Delete ${term.term}`} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <details className={styles.history}>
        <summary>History</summary>
        <ul>
          {term.history.map((entry) => (
            <li key={`${entry.at}/${entry.action}/${entry.detail}`}>
              {formatMeetingDate(entry.at)}: {HISTORY_LABELS[entry.action]}. {entry.detail}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Terms({ terms, onChanged }: { terms: VocabularyTerm[]; onChanged(): void }) {
  const backend = useBackend();
  const [editing, setEditing] = useState<VocabularyTerm | null>(null);
  const [deleting, setDeleting] = useState<VocabularyTerm | null>(null);
  const { busy, error, run } = useAction();

  const toggle = (term: VocabularyTerm) =>
    void run(async () => {
      await backend.call('updateTerm', { id: term.id, patch: { enabled: !term.enabled } });
      onChanged();
    });

  const remove = async (term: VocabularyTerm) => {
    await backend.call('deleteTerm', { id: term.id });
    setDeleting(null);
    onChanged();
  };

  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {terms.map((term) => (
          <TermRow
            key={term.id}
            term={term}
            toggleDisabled={busy}
            onEdit={() => setEditing(term)}
            onDelete={() => setDeleting(term)}
            onToggle={() => toggle(term)}
          />
        ))}
      </ul>
      {editing && (
        <EditDialog
          term={editing}
          onSaved={() => {
            setEditing(null);
            onChanged();
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
    </>
  );
}

export function VocabularyScreen() {
  const { state, reload } = useBackendData(load);
  return (
    <Screen title="Vocabulary">
      <DataView state={state}>
        {(terms) =>
          terms.length === 0 ? (
            <EmptyState title="No terms yet">
              Corrections you choose to remember will appear here.
            </EmptyState>
          ) : (
            <Terms terms={terms} onChanged={reload} />
          )
        }
      </DataView>
    </Screen>
  );
}
