import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Backend, BackendEvents, RecordingSnapshot } from '@scrb/contracts';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { useRecordingStatus } from '../../shell/use-recording-status.ts';

const RECORDING = {
  status: 'recording',
  meetingId: 'invented-meeting',
  elapsedMs: 1000,
  pauseReason: null,
  privacyBannerRequired: false,
} as const;

function setup() {
  const handlers = new Map<string, (payload: never) => void>();
  let answer!: (snapshot: RecordingSnapshot) => void;
  const backend = {
    on: (name: string, handler: (payload: never) => void) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    call: () => new Promise<RecordingSnapshot>((resolve) => (answer = resolve)),
  } as unknown as Backend;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BackendProvider backend={backend}>{children}</BackendProvider>
  );
  const hook = renderHook(() => useRecordingStatus(), { wrapper });
  const emit = <K extends keyof BackendEvents>(name: K, payload: BackendEvents[K]) =>
    act(() => handlers.get(name)?.(payload as never));
  return { hook, emit, answer: (snapshot: RecordingSnapshot) => act(async () => answer(snapshot)) };
}

describe('useRecordingStatus', () => {
  afterEach(cleanup);

  it('does not let a slower snapshot hide a newer transcription failure', async () => {
    const { hook, emit, answer } = setup();
    emit('transcriptionLag', { status: 'failed', lagMs: 0 });
    await answer({ state: RECORDING, pauseSpans: [], health: null, transcription: null });
    expect(hook.result.current.lag?.status).toBe('failed');
    expect(hook.result.current.recording.status).toBe('recording');
  });

  it('does not carry a failed transcript into the next recording', async () => {
    const { hook, emit } = setup();
    emit('recordingStateChanged', RECORDING);
    emit('transcriptionLag', { status: 'failed', lagMs: 0 });
    emit('recordingStateChanged', { ...RECORDING, status: 'idle', meetingId: null });
    emit('recordingStateChanged', { ...RECORDING, meetingId: 'invented-next' });
    expect(hook.result.current.lag).toBeNull();
  });
});
