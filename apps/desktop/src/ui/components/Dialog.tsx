import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAction } from '../lib/use-action.ts';
import { Button } from './Button.tsx';
import styles from './Dialog.module.css';

const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  title: string;
  /** Omit to make the dialog impossible to dismiss, as for a required first-launch question. */
  onClose?: () => void;
  children: ReactNode;
}

/** Modal dialog. Traps Tab while open and hands focus back to the opener when it closes. */
export function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], ' + FOCUSABLE);
    (first ?? panel.current)?.focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && onClose) {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => !item.matches(':disabled'),
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

interface ActionDialogProps {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  /** Stays open and shows the error if this rejects; the caller closes it on success. */
  onConfirm(): Promise<void>;
  onCancel(): void;
  children: ReactNode;
}

/** A form dialog with Cancel and one action. Enter submits. */
export function ActionDialog(props: ActionDialogProps) {
  const { title, confirmLabel, danger, disabled, onConfirm, onCancel, children } = props;
  const { busy, error, run } = useAction();
  return (
    <Dialog title={title} onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) void run(onConfirm);
        }}
      >
        <div className={styles.body}>{children}</div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy || disabled}>
            {confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

interface TextDialogProps {
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  onConfirm(text: string): Promise<void>;
  onCancel(): void;
}

export function TextDialog(props: TextDialogProps) {
  const { title, label, initial = '', confirmLabel, onConfirm, onCancel } = props;
  const [text, setText] = useState(initial);
  const trimmed = text.trim();
  return (
    <ActionDialog
      title={title}
      confirmLabel={confirmLabel}
      disabled={trimmed === ''}
      onConfirm={() => onConfirm(trimmed)}
      onCancel={onCancel}
    >
      <label className={styles.field}>
        {label}
        <input
          data-autofocus
          value={text}
          maxLength={300}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
    </ActionDialog>
  );
}

export interface Choice {
  id: string;
  label: string;
}

interface ChoiceDialogProps {
  title: string;
  label: string;
  choices: Choice[];
  confirmLabel: string;
  /** Text shown above the list. */
  children?: ReactNode;
  onConfirm(id: string): Promise<void>;
  onCancel(): void;
}

export function ChoiceDialog(props: ChoiceDialogProps) {
  const { title, label, choices, confirmLabel, children, onConfirm, onCancel } = props;
  const [chosen, setChosen] = useState(choices[0]?.id ?? '');
  return (
    <ActionDialog
      title={title}
      confirmLabel={confirmLabel}
      disabled={chosen === ''}
      onConfirm={() => onConfirm(chosen)}
      onCancel={onCancel}
    >
      {children}
      <label className={styles.field}>
        {label}
        <select data-autofocus value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
    </ActionDialog>
  );
}
