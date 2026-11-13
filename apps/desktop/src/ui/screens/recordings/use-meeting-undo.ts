import { useEffect } from 'react';
import type { MeetingId } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { useUndo } from '../live/use-undo.ts';

/** The Live screen's undo state, refreshed from the backend when a finished meeting opens. */
export function useMeetingUndo(meetingId: MeetingId) {
  const backend = useBackend();
  const undo = useUndo(meetingId);
  const { record } = undo;
  useEffect(() => {
    let current = true;
    backend.call('getUndoState', { meetingId }).then(
      (state) => {
        if (current) record(state);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [backend, meetingId, record]);
  return undo;
}
