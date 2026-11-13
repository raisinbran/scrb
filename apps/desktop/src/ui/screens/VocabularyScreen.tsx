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
import { DataView, EmptyState, Screen } from './Screen.tsx';
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

function UsageNote({ terms }: { terms: VocabularyTerm[] }) {
  const enabled = terms.filter((term) => term.enabled).length;
  return (
    <p className={styles.note}>
      <strong>{enabled} enabled, up to 40 used.</strong> Only the most recently updated enabled
      terms (about 40, and at most 512 characters) are used for transcription. Disabling terms you
      do not need frees room.
    </p>
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
      <UsageNote terms={terms} />
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

function Suggestions({
  suggestions,
  onChanged,
}: {
  suggestions: VocabularySuggestion[];
  onChanged(): void;
}) {
  const backend = useBackend();
  const { busy, error, run } = useAction();

  const answer = (suggestion: VocabularySuggestion, accepted: boolean) =>
    void run(async () => {
      try {
        await backend.call('answerVocabularySuggestion', { id: suggestion.id, accepted });
      } finally {
        onChanged();
      }
    });

  return (
    <section aria-labelledby="suggested-terms" className={styles.suggestions}>
      <h2 id="suggested-terms" className={styles.subheading}>
        Suggested terms
      </h2>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className={styles.row}>
            <div className={styles.main}>
              <div className={styles.text}>
                <span className={styles.term}>{suggestion.term}</span>
                {suggestion.misheard.length > 0 && (
                  <span className={styles.muted}>
                    Heard as: {suggestion.misheard.slice(0, 3).join(', ')}
                  </span>
                )}
                <span className={styles.muted}>
                  {suggestion.correctionCount}{' '}
                  {suggestion.correctionCount === 1 ? 'correction' : 'corrections'} in{' '}
                  {suggestion.meetingCount} {suggestion.meetingCount === 1 ? 'meeting' : 'meetings'}
                </span>
              </div>
              <div className={styles.actions}>
                <Button
                  aria-label={`Remember ${suggestion.term}`}
                  disabled={busy}
                  onClick={() => answer(suggestion, true)}
                >
                  Remember
                </Button>
                <Button
                  aria-label={`Dismiss ${suggestion.term}`}
                  disabled={busy}
                  onClick={() => answer(suggestion, false)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VocabularyScreen() {
  const { state, reload } = useBackendData(load);
  return (
    <Screen title="Vocabulary">
      <DataView state={state}>
        {({ terms, suggestions }) => (
          <>
            {suggestions.length > 0 && <Suggestions suggestions={suggestions} onChanged={reload} />}
            {terms.length === 0 ? (
              <EmptyState title="No terms yet">
                Corrections you choose to remember will appear here.
              </EmptyState>
            ) : (
              <Terms terms={terms} onChanged={reload} />
            )}
          </>
        )}
      </DataView>
    </Screen>
  );
}
