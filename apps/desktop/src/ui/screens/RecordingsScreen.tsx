import { useState } from 'react';
import { readStored, writeStored } from '../lib/stored-value.ts';
import { LibraryView } from './recordings/LibraryView.tsx';
import { MeetingDetailView } from './recordings/MeetingDetailView.tsx';
import { EmptyState } from './Screen.tsx';
import styles from './recordings/recordings.module.css';

export const OPEN_MEETING_KEY = 'scrb.recordings.open';

interface OpenMeeting {
  id: string;
  jumpMs?: number;
}

export function RecordingsScreen() {
  const [open, setOpen] = useState<OpenMeeting | null>(() => {
    const id = readStored<string>(OPEN_MEETING_KEY);
    return id ? { id } : null;
  });
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <LibraryView
      notice={notice}
      selectedId={open?.id ?? null}
      onOpen={(id, jumpMs) => {
        setNotice(null);
        writeStored(OPEN_MEETING_KEY, id);
        setOpen(jumpMs === undefined ? { id } : { id, jumpMs });
      }}
    >
      {open ? (
        <MeetingDetailView
          key={open.id}
          meetingId={open.id}
          jumpMs={open.jumpMs}
          onBack={(message) => {
            writeStored(OPEN_MEETING_KEY, null);
            setNotice(message ?? null);
            setOpen(null);
          }}
        />
      ) : (
        <div className={styles.emptyPanel}>
          <EmptyState title="Select a recording">
            Choose a recording from the list to read, play or edit it.
          </EmptyState>
        </div>
      )}
    </LibraryView>
  );
}
