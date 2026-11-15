import { useEffect, useState } from 'react';
import type { MeetingId, MeetingStatus } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';

/** A recording is being worked on while its final pass runs or its audio is being imported. */
const BUSY: ReadonlySet<MeetingStatus> = new Set(['finalPassRunning', 'importing']);

/** True while any meeting is in its final pass or being imported. Starts from the list, then follows changes. */
export function useAnyProcessing(): boolean {
  const backend = useBackend();
  const [busy, setBusy] = useState<ReadonlySet<MeetingId>>(new Set());
  useEffect(() => {
    let live = true;
    /** Meetings a later event has already spoken for: an older list answer must not override them. */
    const heard = new Set<MeetingId>();
    const change = (id: MeetingId, status: MeetingStatus): void => {
      heard.add(id);
      setBusy((previous) => {
        if (BUSY.has(status) === previous.has(id)) return previous;
        const next = new Set(previous);
        if (BUSY.has(status)) next.add(id);
        else next.delete(id);
        return next;
      });
    };
    const off = backend.on('meetingChanged', (meeting) => change(meeting.id, meeting.status));
    backend
      .call('listMeetings', {})
      .then((meetings) => {
        if (!live) return;
        setBusy((previous) => {
          const next = new Set(previous);
          for (const meeting of meetings) {
            if (!heard.has(meeting.id) && BUSY.has(meeting.status)) next.add(meeting.id);
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [backend]);
  return busy.size > 0;
}
