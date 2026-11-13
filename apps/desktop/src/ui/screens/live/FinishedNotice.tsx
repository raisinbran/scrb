import { useEffect, useState } from 'react';
import type { MeetingId, MeetingStatus } from '@scrb/contracts';
import { DismissButton } from '../../components/DismissButton.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { useRemembered } from '../../lib/tab-memory.ts';
import styles from '../LiveScreen.module.css';

function noticeOf(status: MeetingStatus | null): string | null {
  switch (status) {
    case 'ready':
      return null;
    case 'finalPassRunning':
      return 'Recording stopped. The final pass is running; find this meeting in Recordings.';
    case 'transcriptionFailed':
      return 'Recording stopped. The transcript could not be finished; the audio is saved in Recordings.';
    default:
      return 'Recording stopped. Find this meeting in Recordings.';
  }
}

/** Follows the stopped meeting, so the notice goes away once the transcript is final. */
export function FinishedNotice({ meetingId }: { meetingId: MeetingId }) {
  const backend = useBackend();
  const [status, setStatus] = useState<MeetingStatus | null>(null);
  const [dismissed, setDismissed] = useRemembered(`notice.stopped.${meetingId}`, false);

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

  const text = noticeOf(status);
  // A final transcript needs no notice: the meeting is simply in Recordings.
  if (dismissed || text === null) return null;
  return (
    <div className={styles.finished}>
      <p role="status">{text}</p>
      <DismissButton label="Dismiss notice" onClick={() => setDismissed(true)} />
    </div>
  );
}
