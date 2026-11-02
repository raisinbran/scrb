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
    // An event that lands first is newer than the snapshot on its way.
    const seen = new Set<'recording' | 'health' | 'lag'>();
    const unsubscribers = [
      backend.on('recordingStateChanged', (state) => {
        seen.add('recording');
        setRecording(state);
        if (state.status === 'idle') {
          seen.add('lag');
          setLag(null);
        }
      }),
      backend.on('recordingHealth', (next) => {
        seen.add('health');
        setHealth(next);
      }),
      backend.on('transcriptionLag', (next) => {
        seen.add('lag');
        setLag(next);
      }),
    ];
    void backend.call('getRecordingSnapshot').then(
      (snapshot) => {
        if (!seen.has('recording')) setRecording(snapshot.state);
        if (!seen.has('health')) setHealth(snapshot.health);
        if (!seen.has('lag')) setLag(snapshot.transcription);
      },
      () => undefined,
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [backend]);

  return { recording, health, lag };
}
