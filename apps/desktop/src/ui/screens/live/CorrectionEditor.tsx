import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import styles from './TranscriptView.module.css';

interface CorrectionEditorProps {
  originalText: string;
  top: number;
  /** Rejects with a message to show; the editor stays open with the typed text. */
  onApply(text: string, remember: boolean): Promise<void>;
  onCancel(): void;
}

/** Holds its own draft, so typing renders only this form while transcript text keeps arriving. */
export function CorrectionEditor({ originalText, top, onApply, onCancel }: CorrectionEditorProps) {
  const [text, setText] = useState(originalText);
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === originalText) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onApply(trimmed, remember);
    } catch (failure) {
      setSaving(false);
      setError(failure instanceof Error ? failure.message : 'The correction could not be saved.');
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') onCancel();
  };

  return (
    <form
      className={styles.editor}
      style={{ top }}
      aria-label="Correct transcript"
      onSubmit={(event) => void submit(event)}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <label className={styles.editorField}>
        Correct text
        <input
          ref={inputRef}
          className={styles.editorInput}
          value={text}
          maxLength={20_000}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className={styles.editorCheck}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        Remember correction
      </label>
      {error && (
        <p className={styles.editorError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.editorActions}>
        <button type="button" className={styles.toolButton} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={saving || text.trim() === ''}
        >
          Apply
        </button>
      </div>
    </form>
  );
}
