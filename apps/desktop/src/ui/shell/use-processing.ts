import { useEffect, useState } from 'react';
import type { Backend, MeetingId, MeetingStatus } from '@scrb/contracts';
import { useProcessingBackend } from '../lib/backend-context.tsx';
import { seedFinalPassProgress } from '../lib/final-pass-progress.ts';

/** Processing is reported by real meeting states, never combined real+mock demo records. */
export function useProcessingCounts(): { finalPass: number; importing: number } {
  const backend = useProcessingBackend();
  const [snapshot, setSnapshot] = useState<{
    backend: Backend;
    statuses: ReadonlyMap<MeetingId, MeetingStatus>;
  }>(() => ({ backend, statuses: new Map() }));

  useEffect(() => {
    let live = true;
    let serial = 0;
    let request = 0;
    let current = new Map<MeetingId, MeetingStatus>();
    const observed = new Map<MeetingId, { status: MeetingStatus; serial: number }>();
    const publish = () => setSnapshot({ backend, statuses: new Map(current) });
    const refresh = () => {
      const startedAt = serial;
      const requestId = ++request;
      void backend
        .call('listMeetings', {})
        .then((meetings) => {
          if (!live || requestId !== request) return;
          seedFinalPassProgress(backend, meetings);
          const next = new Map<MeetingId, MeetingStatus>();
          for (const meeting of meetings) next.set(meeting.id, meeting.status);
          // Only events newer than this particular list request override its result.
          for (const [id, update] of observed) {
            if (update.serial > startedAt) next.set(id, update.status);
          }
          current = next;
          publish();
        })
        .catch(() => undefined);
    };
    const stops = [
      backend.on('meetingChanged', (meeting) => {
        if (!live) return;
        observed.set(meeting.id, { status: meeting.status, serial: ++serial });
        current.set(meeting.id, meeting.status);
        publish();
      }),
      // A failed/cancelled import can delete its meeting without a final meetingChanged event.
      backend.on('importFinished', refresh),
      backend.on('importFailed', refresh),
      backend.on('importCancelled', refresh),
    ];
    refresh();
    return () => {
      live = false;
      stops.forEach((stop) => stop());
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
