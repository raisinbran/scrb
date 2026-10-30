import { useRecordingStatus } from '../shell/use-recording-status.ts';
import { EmptyState, Screen } from './Screen.tsx';

export function LiveScreen() {
  const { recording } = useRecordingStatus();
  return (
    <Screen title="Live">
      <EmptyState title={recording.status === 'idle' ? 'Not recording' : 'Recording in progress'}>
        Recording controls and the live transcript arrive in Phases 2 and 3.
      </EmptyState>
    </Screen>
  );
}
