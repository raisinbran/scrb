import { useState } from 'react';
import { readStored, writeStored } from '../lib/stored-value.ts';
import { LibraryView } from './recordings/LibraryView.tsx';
import { MeetingDetailView } from './recordings/MeetingDetailView.tsx';

const OPEN_KEY = 'scrb.recordings.open';

interface OpenMeeting {
  id: string;
  jumpMs?: number;
}

export function RecordingsScreen() {
  const [open, setOpen] = useState<OpenMeeting | null>(() => {
    const id = readStored<string>(OPEN_KEY);
    return id ? { id } : null;
  });
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) {
    return (
      <LibraryView
        notice={notice}
        onOpen={(id, jumpMs) => {
          setNotice(null);
          writeStored(OPEN_KEY, id);
          setOpen(jumpMs === undefined ? { id } : { id, jumpMs });
        }}
      />
    );
  }

  return (
    <MeetingDetailView
      key={open.id}
      meetingId={open.id}
      jumpMs={open.jumpMs}
      onBack={(message) => {
        writeStored(OPEN_KEY, null);
        setNotice(message ?? null);
        setOpen(null);
      }}
    />
  );
}
