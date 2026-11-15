import { cachedSources, fetchSources, type Sources } from '../lib/sources-cache.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WHOLE_COMPUTER_SOURCE_ID, type DeviceChange, type SourceSelection } from '@scrb/contracts';
import { isTranscribing } from '../components/RecordingDot.tsx';
import { useBackend } from '../lib/backend-context.tsx';
import { useSetupBlocked } from '../lib/mock-mode.tsx';
import { useModelsNeeded, useOpenModels } from '../lib/models-missing.tsx';
import { formatFileSize } from '../lib/format.ts';
import { useRecordingStatus } from '../shell/use-recording-status.ts';
import { LevelMeters } from './live/LevelMeters.tsx';
import { FinishedNotice } from './live/FinishedNotice.tsx';
import { LiveAlerts } from './live/LiveAlerts.tsx';
import { MicTest } from './live/MicTest.tsx';
import { RecordingControls } from './live/RecordingControls.tsx';
import { SourcePickers } from './live/SourcePickers.tsx';
import { TranscriptView, type TranscriptViewHandle } from './live/TranscriptView.tsx';
import { useLiveShortcuts } from './live/use-live-shortcuts.ts';
import styles from './LiveScreen.module.css';

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Something went wrong.';
}

export function LiveScreen() {
  const backend = useBackend();
  const { recording, health, lag } = useRecordingStatus();
  const [sources, setSources] = useState<Sources>(
    () => cachedSources() ?? { devices: [], apps: [] },
  );
  const [sourcesReady, setSourcesReady] = useState(() => cachedSources() !== null);
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [fontPx, setFontPx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceChange | null>(null);
  const [lastMeetingId, setLastMeetingId] = useState<string | null>(null);
  const transcriptRef = useRef<TranscriptViewHandle>(null);

  const refreshSources = useCallback(() => {
    fetchSources(backend).then(
      (loaded) => {
        setSources(loaded);
        setSourcesReady(true);
      },
      (failure: unknown) => setError(messageOf(failure)),
    );
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
    if (switching) return;
    const previous = selection;
    setSelection(next);
    setError(null);
    // While recording the helper switches live, so the pickers wait for its answer.
    if (active) setSwitching(true);
    backend
      .call('selectSources', next)
      .catch((failure: unknown) => {
        setSelection(previous);
        setError(messageOf(failure));
      })
      .finally(() => setSwitching(false));
  };

  const changeFont = (next: number) => {
    setFontPx(next);
    backend.call('updateSettings', { transcriptFontPx: next }).catch(() => undefined);
  };

  const models = useModelsNeeded();
  const startBlocked = models.startBlockedReason !== null;

  useLiveShortcuts({
    onStartStop: () => {
      if (busy) return;
      if (status === 'idle') {
        if (!startBlocked) start();
      } else if (active) stop();
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
  const setupBlocked = useSetupBlocked();
  const openModels = useOpenModels();

  return (
    <div className={styles.live}>
      <div className={styles.header}>
        <h1 className={styles.title}>Live</h1>
        <RecordingControls
          status={status}
          elapsedMs={recording.elapsedMs}
          pauseReason={recording.pauseReason}
          busy={busy}
          transcribing={isTranscribing(lag)}
          startBlocked={startBlocked}
          startBlockedReason={models.startBlockedReason ?? undefined}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onStop={stop}
        />
      </div>
      <div className={styles.sources}>
        {/* Until the lists arrive the pickers take their final room but stay invisible, so nothing moves. */}
        <div className={selection && sourcesReady ? undefined : styles.pickersPending}>
          <SourcePickers
            devices={sources.devices}
            apps={sources.apps}
            selection={selection ?? { micDeviceId: null, meetingAppId: WHOLE_COMPUTER_SOURCE_ID }}
            switching={switching}
            onSelect={selectSources}
          />
        </div>
        {status === 'idle' ? (
          <MicTest sources={selection} devices={sources.devices} />
        ) : (
          <div className={styles.testRow} aria-hidden="true" />
        )}
        <LevelMeters active={status === 'recording'} />
      </div>
      <div className={styles.alertsSlot}>
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
      </div>
      {status === 'idle' && lastMeetingId && (
        <FinishedNotice key={lastMeetingId} meetingId={lastMeetingId} />
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
          <p className={styles.idleTitle}>
            {models.missing
              ? 'Models needed'
              : models.restartNeeded
                ? 'Restarting'
                : models.setup !== 'ready'
                  ? 'Checking setup'
                  : setupBlocked
                    ? 'Cannot record yet'
                    : 'Ready to record'}
          </p>
          <p className={styles.idleBody}>
            {models.missing
              ? `Scribe needs to download its speech models (${formatFileSize(models.bytes)}) before it can record.`
              : models.startBlockedReason
                ? `${models.startBlockedReason}.`
                : (setupBlocked ?? 'Choose your sources, then press Start.')}
          </p>
          {models.missing && (
            <button type="button" className={styles.button} onClick={openModels}>
              Download models
            </button>
          )}
        </div>
      )}
    </div>
  );
}
