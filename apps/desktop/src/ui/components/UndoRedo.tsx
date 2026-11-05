import type { UndoState } from '@scrb/contracts';
import { useAction } from '../lib/use-action.ts';
import { Button } from './Button.tsx';
import styles from './UndoRedo.module.css';

interface UndoRedoProps {
  state: UndoState;
  undoLabel?: string;
  redoLabel?: string;
  onUndo(): Promise<unknown>;
  onRedo(): Promise<unknown>;
  onChanged(): void;
}

/** Undo and redo for a list screen, whose history lives in the backend. */
export function UndoRedo(props: UndoRedoProps) {
  const { state, undoLabel = 'Undo', redoLabel = 'Redo', onUndo, onRedo, onChanged } = props;
  const { busy, error, run } = useAction();
  const act = (change: () => Promise<unknown>) =>
    void run(async () => {
      await change();
      onChanged();
    });
  return (
    <div className={styles.bar}>
      <Button disabled={busy || !state.canUndo} onClick={() => act(onUndo)}>
        {undoLabel}
      </Button>
      <Button disabled={busy || !state.canRedo} onClick={() => act(onRedo)}>
        {redoLabel}
      </Button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
