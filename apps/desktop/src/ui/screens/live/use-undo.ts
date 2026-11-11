import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingId, UndoState } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';

const NOTHING_TO_UNDO: UndoState = { canUndo: false, canRedo: false };

export function useUndo(meetingId: MeetingId) {
  const backend = useBackend();
  const [state, setState] = useState(NOTHING_TO_UNDO);
  const [error, setError] = useState<string | null>(null);
  const change = useRef(0);

  const record = useCallback((next: UndoState) => {
    change.current += 1;
    setState(next);
  }, []);

  const refresh = useCallback(() => {
    const asked = change.current;
    backend.call('getUndoState', { meetingId }).then(
      (next) => {
        // An answer to an older question must not overwrite a newer undo or correction.
        if (asked === change.current) setState(next);
      },
      () => undefined,
    );
  }, [backend, meetingId]);

  useEffect(refresh, [refresh]);

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
    refresh,
    undo: useCallback(() => run('undo'), [run]),
    redo: useCallback(() => run('redo'), [run]),
  };
}
