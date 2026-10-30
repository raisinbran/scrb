import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Backend,
  DeviceChange,
  InputDevice,
  MeetingApp,
  SourceSelection,
} from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';
import { useRecordingStatus } from '../shell/use-recording-status.ts';
import { LevelMeters } from './live/LevelMeters.tsx';
import { HealthIndicator, LagIndicator, LiveAlerts } from './live/LiveAlerts.tsx';
import { RecordingControls } from './live/RecordingControls.tsx';
import { SourcePickers } from './live/SourcePickers.tsx';
import { TranscriptView, type TranscriptViewHandle } from './live/TranscriptView.tsx';
import { useLiveShortcuts } from './live/use-live-shortcuts.ts';
import styles from './LiveScreen.module.css';

interface Sources {
  devices: InputDevice[];
  apps: MeetingApp[];
}

async function loadSources(backend: Backend): Promise<Sources> {
  const [devices, apps] = await Promise.all([
    backend.call('listInputDevices'),
    backend.call('listMeetingApps'),
  ]);
  return { devices, apps };
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Something went wrong.';
}

export function LiveScreen() {
  const backend = useBackend();
  const { recording, health, lag } = useRecordingStatus();
  const [sources, setSources] = useState<Sources>({ devices: [], apps: [] });
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [fontPx, setFontPx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceChange | null>(null);
  const [lastMeetingId, setLastMeetingId] = useState<string | null>(null);
  const transcriptRef = useRef<TranscriptViewHandle>(null);

  const refreshSources = useCallback(() => {
    loadSources(backend).then(setSources, (failure: unknown) => setError(messageOf(failure)));
  }, [backend]);

  useEffect(() => {
    refreshSources();
    backend.call('getSettings').then(
      ({ audio, transcriptFontPx }) => {
        setSelection({ micDeviceId: audio.micDeviceId, meetingAppId: audio.meetingAppId });
        setFontPx(transcriptFontPx);
      },
      (failure: unknown) => setError(messageOf(failure)),
    );
    return backend.on('deviceChanged', (change) => {
      setDevice(change);
      refreshSources();
    });
  }, [backend, refreshSources]);

  if (recording.meetingId && recording.meetingId !== lastMeetingId) {
    setLastMeetingId(recording.meetingId);
  }

  const run = useCallback((action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    action()
      .catch((failure: unknown) => setError(messageOf(failure)))
      .finally(() => setBusy(false));
  }, []);

  const { status } = recording;
  const active = status === 'recording' || status === 'paused';
  const start = useCallback(() => {
    run(() => backend.call('startRecording', {}));
  }, [backend, run]);
  const stop = useCallback(() => run(() => backend.call('stopRecording')), [backend, run]);
  const pause = useCallback(() => run(() => backend.call('pauseRecording')), [backend, run]);
  const resume = useCallback(() => run(() => backend.call('resumeRecording')), [backend, run]);

  const selectSources = (next: SourceSelection) => {
    const previous = selection;
    setSelection(next);
    backend.call('selectSources', next).catch((failure: unknown) => {
      setSelection(previous);
      setError(messageOf(failure));
    });
  };

  const changeFont = (next: number) => {
    setFontPx(next);
    backend.call('updateSettings', { transcriptFontPx: next }).catch(() => undefined);
  };

  useLiveShortcuts({
    onStartStop: () => {
      if (busy) return;
      if (status === 'idle') start();
      else if (active) stop();
    },
    onPauseResume: () => {
      if (busy) return;
      if (status === 'recording') pause();
      else if (status === 'paused') resume();
    },
    onJumpToLive: () => transcriptRef.current?.jumpToLive(),
    onUndo: () => transcriptRef.current?.undo(),
    onRedo: () => transcriptRef.current?.redo(),
  });

  const meetingId = recording.meetingId ?? lastMeetingId;

  return (
    <div className={styles.live}>
      <div className={styles.header}>
        <h1 className={styles.title}>Live</h1>
        <RecordingControls
          status={status}
          elapsedMs={recording.elapsedMs}
          busy={busy}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onStop={stop}
        />
      </div>
      <div className={styles.sources}>
        {selection && (
          <SourcePickers
            devices={sources.devices}
            apps={sources.apps}
            selection={selection}
            onSelect={selectSources}
          />
        )}
        <LevelMeters active={status === 'recording'} />
      </div>
      <div className={styles.indicators}>
        <HealthIndicator health={health} active={active} />
        <LagIndicator lag={lag} active={active} />
      </div>
      <LiveAlerts
        health={health}
        lag={lag}
        active={active}
        device={device}
        error={error}
        onUseDevice={(chosen) => {
          if (selection) selectSources({ ...selection, micDeviceId: chosen.id });
          setDevice(null);
        }}
        onDismissDevice={() => setDevice(null)}
      />
      {status === 'idle' && lastMeetingId && (
        <p className={styles.finished}>
          Recording stopped. The final pass is running; find this meeting in Recordings.
        </p>
      )}
      {meetingId ? (
        <TranscriptView
          key={meetingId}
          ref={transcriptRef}
          meetingId={meetingId}
          fontPx={fontPx ?? 15}
          onFontChange={changeFont}
        />
      ) : (
        <div className={styles.idle}>
          <p className={styles.idleTitle}>Ready to record</p>
          <p className={styles.idleBody}>Choose your sources, then press Start.</p>
        </div>
      )}
    </div>
  );
}
