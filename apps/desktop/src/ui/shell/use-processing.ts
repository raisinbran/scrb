import { useEffect, useState } from 'react';
import type { Backend, MeetingId, MeetingStatus } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';

/** Processing is reported by the existing meeting states; no separate backend owner. */
export function useProcessingCounts(): { finalPass: number; importing: number } {
  const backend = useBackend();
  const [snapshot, setSnapshot] = useState<{
    backend: Backend;
    statuses: ReadonlyMap<MeetingId, MeetingStatus>;
  }>(() => ({ backend, statuses: new Map() }));

  useEffect(() => {
    let live = true;
    let listed: ReadonlyMap<MeetingId, MeetingStatus> | null = null;
    // Events received while listMeetings is in flight take precedence over its older snapshot.
    const heard = new Map<MeetingId, MeetingStatus>();
    const publish = () => {
      const statuses = new Map<MeetingId, MeetingStatus>(listed ?? []);
      for (const [id, status] of heard) statuses.set(id, status);
      setSnapshot({ backend, statuses });
    };
    const off = backend.on('meetingChanged', (meeting) => {
      heard.set(meeting.id, meeting.status);
      publish();
    });
    void backend
      .call('listMeetings', {})
      .then((meetings) => {
        if (!live) return;
        listed = new Map(meetings.map(({ id, status }) => [id, status]));
        publish();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [backend]);

  // Do not display a prior backend's processing state while a different backend loads.
  const statuses = snapshot.backend === backend ? snapshot.statuses : [];
  let finalPass = 0;
  let importing = 0;
  for (const status of statuses.values()) {
    if (status === 'finalPassRunning') finalPass += 1;
    if (status === 'importing') importing += 1;
  }
  return { finalPass, importing };
}

/** Existing sidebar indicator uses the same authoritative meeting-status derivation. */
export function useAnyProcessing(): boolean {
  const { finalPass, importing } = useProcessingCounts();
  return finalPass + importing > 0;
}
