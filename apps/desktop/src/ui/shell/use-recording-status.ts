import { useEffect, useState } from 'react';
import type { RecordingHealth, RecordingState, TranscriptionLag } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';

const IDLE: RecordingState = {
  status: 'idle',
  meetingId: null,
  elapsedMs: 0,
  pauseReason: null,
  privacyBannerRequired: false,
};

/** Recording and transcription status, kept apart so a transcription fault never reads as a recording fault. */
export function useRecordingStatus() {
  const backend = useBackend();
  const [recording, setRecording] = useState<RecordingState>(IDLE);
  const [health, setHealth] = useState<RecordingHealth | null>(null);
  const [lag, setLag] = useState<TranscriptionLag | null>(null);

  useEffect(() => {
    const unsubscribers = [
      backend.on('recordingStateChanged', setRecording),
      backend.on('recordingHealth', setHealth),
      backend.on('transcriptionLag', setLag),
    ];
    void backend.call('getRecordingSnapshot').then(
      (snapshot) => {
        setRecording(snapshot.state);
        setHealth(snapshot.health);
        setLag(snapshot.transcription);
      },
      () => undefined,
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [backend]);

  return { recording, health, lag };
}
