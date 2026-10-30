import { useCallback, useState } from 'react';
import type { Backend, MeetingId, UndoState } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';

const NOTHING_TO_UNDO: UndoState = { canUndo: false, canRedo: false };

// The contract only reports undo state in call responses, so this survives leaving the screen.
// After an app reload it starts empty; see the handoff note on `getUndoState`.
const remembered = new WeakMap<Backend, Map<MeetingId, UndoState>>();

function memoryOf(backend: Backend): Map<MeetingId, UndoState> {
  const memory = remembered.get(backend) ?? new Map<MeetingId, UndoState>();
  remembered.set(backend, memory);
  return memory;
}

export function useUndo(meetingId: MeetingId) {
  const backend = useBackend();
  const [state, setState] = useState(() => memoryOf(backend).get(meetingId) ?? NOTHING_TO_UNDO);
  const [error, setError] = useState<string | null>(null);

  const record = useCallback(
    (next: UndoState) => {
      memoryOf(backend).set(meetingId, next);
      setState(next);
    },
    [backend, meetingId],
  );

  const run = useCallback(
    (action: 'undo' | 'redo') => {
      setError(null);
      backend.call(action, { meetingId }).then(record, (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : `That ${action} did not work.`);
      });
    },
    [backend, meetingId, record],
  );

  return {
    ...state,
    error,
    record,
    undo: useCallback(() => run('undo'), [run]),
    redo: useCallback(() => run('redo'), [run]),
  };
}
