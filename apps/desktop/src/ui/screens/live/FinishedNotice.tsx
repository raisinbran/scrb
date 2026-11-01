import { useEffect, useState } from 'react';
import type { MeetingId, MeetingStatus } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import styles from '../LiveScreen.module.css';

function noticeOf(status: MeetingStatus | null): string {
  switch (status) {
    case 'finalPassRunning':
      return 'Recording stopped. The final pass is running; find this meeting in Recordings.';
    case 'ready':
      return 'Recording stopped. The final transcript is ready in Recordings.';
    case 'transcriptionFailed':
      return 'Recording stopped. The transcript could not be finished; the audio is saved in Recordings.';
    default:
      return 'Recording stopped. Find this meeting in Recordings.';
  }
}

/** Follows the stopped meeting, so the notice never outlives the final pass it describes. */
export function FinishedNotice({ meetingId }: { meetingId: MeetingId }) {
  const backend = useBackend();
  const [status, setStatus] = useState<MeetingStatus | null>(null);

  useEffect(() => {
    let current = true;
    let changed = false;
    const off = backend.on('meetingChanged', (meeting) => {
      if (meeting.id !== meetingId) return;
      changed = true;
      setStatus(meeting.status);
    });
    backend.call('getMeeting', { meetingId }).then(
      (meeting) => {
        if (current && !changed) setStatus(meeting.status);
      },
      () => undefined,
    );
    return () => {
      current = false;
      off();
    };
  }, [backend, meetingId]);

  return <p className={styles.finished}>{noticeOf(status)}</p>;
}
