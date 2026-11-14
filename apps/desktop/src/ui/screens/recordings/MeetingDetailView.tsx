import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AppSettings, Backend, MeetingDetail } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { formatDuration, formatElapsed, formatMeetingDate } from '../../lib/format.ts';
import { readStored, writeStored } from '../../lib/stored-value.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView, useFocusFallback } from '../Screen.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { Modal } from './Modal.tsx';
import { ProcessingBanner } from './ProcessingBanner.tsx';
import { SummaryTab } from './SummaryTab.tsx';
import {
  EDITOR_MARK,
  TranscriptTab,
  gapLabel,
  type JumpTarget,
  type TranscriptEditing,
} from './TranscriptTab.tsx';
import { STATUS_LABELS, SUMMARY_STATE_LABELS, isUnfinished } from './labels.ts';
import { usePlayback, type Playback } from './use-playback.ts';
import { useMeetingUndo } from './use-meeting-undo.ts';
import { useTranscript } from './use-transcript.ts';
import { Progress } from '../../components/Progress.tsx';
import styles from './recordings.module.css';

const TAB_KEY = 'scrb.recordings.tab';
const TABS = ['Transcript', 'Summary', 'Audio'] as const;
type Tab = (typeof TABS)[number];
const SKIP_MS = 15_000;
const MIN_FONT_PX = 11;
const MAX_FONT_PX = 28;
const HINT_KEY = 'scrb.recordings.editHintDismissed';

function movePlayback(playback: Playback, durationMs: number, target: number) {
  const clamped = Math.min(durationMs, Math.max(0, target));
  if (playback.isPlaying) playback.play(clamped);
  else playback.setPosition(clamped);
}

/**
 * Keys that belong to the focused control, so the player shortcuts must leave them alone. Buttons
 * own nothing: after a click the focus stays on the button, and Space must still play or pause.
 */
function ownsKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest(`[role="dialog"], [${EDITOR_MARK}]`)) return true;
  // The tabs keep their arrow keys; Space on a tab must still play or pause.
  if (key !== ' ' && target.closest('[role="tablist"]')) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  // The volume slider keeps its arrow keys; Space still plays or pauses.
  if (type === 'range') return key !== ' ' && target.hasAttribute('data-owns-arrows');
  if (type === 'checkbox' || type === 'radio') return key === ' ';
  return true;
}

/** Space plays or pauses; Left and Right skip by 15 s. */
function usePlayerKeys(meeting: MeetingDetail, playback: Playback, enabled: boolean) {
  const latest = useRef({ meeting, playback });
  useEffect(() => {
    latest.current = { meeting, playback };
  });
  useEffect(() => {
    if (!enabled || !meeting.hasAudio) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const { key } = event;
      if (key !== ' ' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      if (ownsKeys(event.target, key)) return;
      const { meeting: current, playback: audio } = latest.current;
      event.preventDefault();
      if (key === ' ') {
        // Holding the key repeats keydown; one press is one toggle.
        if (event.repeat) return;
        if (audio.isPlaying) audio.pause();
        else audio.play(audio.positionMs);
      } else {
        const delta = key === 'ArrowRight' ? SKIP_MS : -SKIP_MS;
        movePlayback(audio, current.durationMs, audio.positionMs + delta);
      }
    };
    // A button presses on Space's key-up in some browsers, so that must not click it either.
    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === ' ' && !ownsKeys(event.target, ' ')) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, meeting.hasAudio]);
}

function PlayerBar({ meeting, playback }: { meeting: MeetingDetail; playback: Playback }) {
  const { positionMs, isPlaying, play, pause, volume, muted } = playback;
  const { durationMs } = meeting;
  const move = (target: number) => movePlayback(playback, durationMs, target);
  return (
    <div className={styles.player} role="group" aria-label="Audio player">
      <button
        type="button"
        className={styles.button}
        disabled={!meeting.hasAudio}
        onClick={() => (isPlaying ? pause() : play(positionMs))}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="Back 15 seconds"
        disabled={!meeting.hasAudio}
        onClick={() => move(positionMs - SKIP_MS)}
      >
        −15 s
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="Forward 15 seconds"
        disabled={!meeting.hasAudio}
        onClick={() => move(positionMs + SKIP_MS)}
      >
        +15 s
      </button>
      <input
        type="range"
        className={styles.slider}
        aria-label="Playback position"
        disabled={!meeting.hasAudio}
        aria-valuetext={formatElapsed(positionMs)}
        min={0}
        max={durationMs}
        step={1000}
        value={positionMs}
        onChange={(event) => move(Number(event.target.value))}
      />
      <span className={styles.time}>
        {formatElapsed(positionMs)} / {formatElapsed(durationMs)}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-pressed={muted}
        onClick={playback.toggleMute}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <input
        type="range"
        className={styles.volume}
        data-owns-arrows=""
        aria-label="Volume"
        aria-valuetext={muted ? 'Muted' : `${Math.round(volume * 100)}%`}
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        onChange={(event) => playback.setVolume(Number(event.target.value) / 100)}
      />
      {playback.error && <span role="alert">{playback.error}</span>}
    </div>
  );
}

function AudioTab({ meeting, onOpenAudio }: { meeting: MeetingDetail; onOpenAudio(): void }) {
  const { gaps, durationMs, origin } = meeting;
  return (
    <div className={styles.audio}>
      <section className={styles.summarySection}>
        <h3 className={styles.sectionTitle}>Tracks</h3>
        {origin === 'imported' ? (
          <p>One meeting track, converted from the imported file. The original is unchanged.</p>
        ) : (
          <ul className={styles.plainList}>
            <li>Your microphone</li>
            <li>Meeting audio</li>
          </ul>
        )}
        <button type="button" className={styles.button} onClick={onOpenAudio}>
          Open audio folder
        </button>
      </section>
      <section className={styles.summarySection}>
        <h3 className={styles.sectionTitle}>Timeline</h3>
        <div className={styles.timeline} aria-hidden="true">
          {gaps.map((gap) => (
            <span
              key={gap.startMs}
              className={styles.timelineGap}
              style={{
                left: `${(gap.startMs / durationMs) * 100}%`,
                width: `${Math.max(0.5, ((gap.endMs - gap.startMs) / durationMs) * 100)}%`,
              }}
            />
          ))}
        </div>
        {!meeting.hasAudio ? (
          <p className={styles.muted}>No saved audio is available for playback.</p>
        ) : gaps.length === 0 ? (
          <p className={styles.muted}>No gaps are recorded in the audio timeline.</p>
        ) : (
          <ul className={styles.plainList}>
            {gaps.map((gap) => (
              <li key={gap.startMs}>{gapLabel(gap)}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EditDetailsDialog({
  meeting,
  onSaved,
  onClose,
}: {
  meeting: MeetingDetail;
  onSaved(): void;
  onClose(): void;
}) {
  const backend = useBackend();
  const [title, setTitle] = useState(meeting.title);
  const [date, setDate] = useState(meeting.startedAt.slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await backend.call('updateMeeting', {
        meetingId: meeting.id,
        title: title.trim(),
        // Only the day is editable, so the time of day stays as it was.
        startedAt: `${date}${meeting.startedAt.slice(10)}`,
      });
      onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.');
    }
  };

  return (
    <Modal title="Edit details" onClose={onClose}>
      <label className={styles.field}>
        Title
        <input
          data-autofocus
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        Date
        <input
          type="date"
          className={styles.input}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className={styles.modalActions}>
        <button type="button" className={styles.button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={!title.trim() || !date}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

type DeleteStep =
  | { step: 'confirming' }
  | { step: 'deleting' }
  | { step: 'incomplete'; remaining: string[] }
  | { step: 'failed'; message: string };

function DeleteDialog({
  meeting,
  onDeleted,
  onClose,
}: {
  meeting: MeetingDetail;
  onDeleted(title: string): void;
  onClose(): void;
}) {
  const backend = useBackend();
  const [state, setState] = useState<DeleteStep>({ step: 'confirming' });

  const run = async () => {
    setState({ step: 'deleting' });
    try {
      const result = await backend.call('deleteMeeting', { meetingId: meeting.id });
      if (result.verified) onDeleted(meeting.title);
      else setState({ step: 'incomplete', remaining: result.remaining });
    } catch (failure) {
      setState({
        step: 'failed',
        message: failure instanceof Error ? failure.message : 'The meeting could not be deleted.',
      });
    }
  };

  if (state.step === 'deleting') {
    return (
      <Modal title="Delete meeting">
        <p role="status">Deleting {meeting.title}…</p>
        <Progress label="Delete progress" />
      </Modal>
    );
  }

  return (
    <Modal title="Delete meeting" onClose={onClose}>
      {state.step === 'confirming' && (
        <p>
          Delete <strong>{meeting.title}</strong>? This permanently removes its audio, transcript,
          summary and exports from this computer.
        </p>
      )}
      {state.step === 'incomplete' && (
        <div role="alert">
          <p>Some files could not be removed:</p>
          <ul className={styles.plainList}>
            {state.remaining.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {state.step === 'failed' && <p role="alert">{state.message}</p>}
      <div className={styles.modalActions}>
        <button type="button" data-autofocus className={styles.button} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.danger} onClick={() => void run()}>
          {state.step === 'confirming' ? 'Delete' : 'Try again'}
        </button>
      </div>
    </Modal>
  );
}

const loadSettings = (backend: Backend) => backend.call('getSettings');

interface LoadedDetailProps {
  meeting: MeetingDetail;
  settings: AppSettings;
  initialJumpMs: number | undefined;
  onBack(notice?: string): void;
  onChanged(): void;
}

function LoadedDetail(props: LoadedDetailProps) {
  const { meeting, settings, initialJumpMs, onBack, onChanged } = props;
  const backend = useBackend();
  const meetingId = meeting.id;
  const heading = useFocusFallback();
  const [tab, setTab] = useState<Tab>(() =>
    initialJumpMs === undefined ? (readStored<Tab>(TAB_KEY) ?? 'Transcript') : 'Transcript',
  );
  const [dialog, setDialog] = useState<'export' | 'delete' | 'edit' | null>(null);
  const [jump, setJump] = useState<JumpTarget | null>(
    initialJumpMs === undefined ? null : { ms: initialJumpMs, nonce: 0 },
  );
  // A word at 0 ms leaves the position at 0, so "placed" is tracked on its own.
  const [editorOpen, setEditorOpen] = useState(false);
  const [hintShown, setHintShown] = useState(() => readStored<boolean>(HINT_KEY) !== true);
  const [placed, setPlaced] = useState(false);
  const [fontPx, setFontPx] = useState(settings.transcriptFontPx);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const playback = usePlayback(meetingId);
  const transcript = useTranscript(meetingId, meeting.status);
  const undoState = useMeetingUndo(meetingId);

  const selectTab = (next: Tab) => {
    setTab(next);
    writeStored(TAB_KEY, next);
  };

  const onTabKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length] as Tab;
    selectTab(next);
    document.getElementById(`meeting-tab-${next}`)?.focus();
  };

  const openFolder = (folder: 'meeting' | 'audio') => {
    setFolderError(null);
    backend
      .call('openMeetingFolder', { meetingId, folder })
      .catch(() => setFolderError('The folder could not be opened.'));
  };

  const changeFont = (delta: number) => {
    const next = Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, fontPx + delta));
    setFontPx(next);
    backend.call('updateSettings', { transcriptFontPx: next }).catch(() => undefined);
  };

  const showInTranscript = () => {
    selectTab('Transcript');
    setJump({ ms: playback.positionMs, nonce: Date.now() });
  };

  const live = meeting.status === 'recording' || meeting.status === 'paused';
  const canEdit = !live && meeting.status !== 'deleting';
  usePlayerKeys(meeting, playback, !live && dialog === null && !editorOpen);
  const { undo, redo } = undoState;
  useEffect(() => {
    if (!canEdit || tab !== 'Transcript' || dialog !== null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest(`[${EDITOR_MARK}]`) ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      if (key === 'y' || event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, tab, dialog, undo, redo]);

  const editing: TranscriptEditing | undefined = canEdit
    ? {
        correctRange: async (firstWordId, lastWordId, text, remember) => {
          const next = await backend.call('applyCorrection', {
            meetingId,
            range: { firstWordId, lastWordId },
            text,
            remember,
          });
          undoState.record(next);
        },
        renameSpeaker: async (speakerId, name) => {
          await backend.call('renameSpeaker', {
            target: { kind: 'meetingSpeaker', meetingId, speakerId },
            name,
          });
          undoState.record(await backend.call('getUndoState', { meetingId }));
        },
      }
    : undefined;
  const dismissHint = () => {
    setHintShown(false);
    writeStored(HINT_KEY, true);
  };
  const unfinished = isUnfinished(meeting.status);
  const status = STATUS_LABELS[meeting.status];
  const summaryLabel = SUMMARY_STATE_LABELS[meeting.summaryState];

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <button type="button" className={styles.back} onClick={() => onBack()}>
          ← Recordings
        </button>
        <h1 ref={heading} className={styles.detailTitle} tabIndex={-1}>
          {meeting.title}
        </h1>
        <p className={styles.muted}>
          {formatMeetingDate(meeting.startedAt)} · {formatDuration(meeting.durationMs)} ·{' '}
          {meeting.origin === 'imported' ? 'Imported' : 'Recorded'}
          {status ? ` · ${status}` : ''}
          {summaryLabel ? ` · ${summaryLabel}` : ''}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={unfinished}
            onClick={() => setDialog('export')}
          >
            Export
          </button>
          <button type="button" className={styles.button} onClick={() => openFolder('meeting')}>
            Open meeting folder
          </button>
          <button type="button" className={styles.button} onClick={() => openFolder('audio')}>
            Open audio folder
          </button>
          <button type="button" className={styles.button} onClick={() => setDialog('edit')}>
            Edit details
          </button>
          <button
            type="button"
            className={styles.dangerQuiet}
            disabled={unfinished || meeting.status === 'deleting'}
            onClick={() => setDialog('delete')}
          >
            Delete
          </button>
        </div>
        {folderError && <p role="alert">{folderError}</p>}
        {meeting.status === 'recovered' && (
          <p className={styles.bannerWarning}>
            Recovered after a crash.
            {meeting.recoveredEndMs !== undefined &&
              ` The recording ended at ${formatElapsed(meeting.recoveredEndMs)}.`}
          </p>
        )}
        {meeting.status === 'transcriptionFailed' && (
          <div role="status" className={styles.bannerWarning}>
            <p>{meeting.transcriptionFailure ?? 'Transcription could not finish.'}</p>
            {meeting.hasAudio && (
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setRetryError(null);
                  void backend.call('retryFinalPass', { meetingId }).then(
                    () => onChanged(),
                    () => setRetryError('The final pass could not be retried.'),
                  );
                }}
              >
                Retry transcription
              </button>
            )}
            {retryError && <p role="alert">{retryError}</p>}
          </div>
        )}
        {meeting.status === 'finalPassRunning' && <ProcessingBanner meetingId={meetingId} />}
        {live && (
          <p role="status" className={styles.bannerInfo}>
            This meeting is still recording. Controls are on the Live screen.
          </p>
        )}
        {meeting.status === 'deleting' && (
          <p role="status" className={styles.bannerInfo}>
            This meeting is being deleted.
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Meeting" className={styles.tabs} onKeyDown={onTabKey}>
        {TABS.map((name) => (
          <button
            key={name}
            id={`meeting-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={name === tab}
            aria-controls="meeting-panel"
            tabIndex={name === tab ? 0 : -1}
            className={name === tab ? styles.tabOn : styles.tab}
            onClick={() => selectTab(name)}
          >
            {name}
          </button>
        ))}
        {tab === 'Transcript' && (
          <span className={styles.fontControls}>
            {canEdit && (
              <>
                <button
                  type="button"
                  className={styles.button}
                  disabled={!undoState.canUndo}
                  onClick={undoState.undo}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className={styles.button}
                  disabled={!undoState.canRedo}
                  onClick={undoState.redo}
                >
                  Redo
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.button}
              aria-label="Smaller transcript text"
              onClick={() => changeFont(-1)}
            >
              A−
            </button>
            <button
              type="button"
              className={styles.button}
              aria-label="Larger transcript text"
              onClick={() => changeFont(1)}
            >
              A+
            </button>
          </span>
        )}
      </div>

      <div
        id="meeting-panel"
        role="tabpanel"
        aria-labelledby={`meeting-tab-${tab}`}
        className={styles.panel}
      >
        {tab === 'Transcript' && canEdit && hintShown && (
          <p className={styles.editHint}>
            Double-click a word to correct it. Click a speaker name to rename them.
            <button type="button" className={styles.button} onClick={dismissHint}>
              Got it
            </button>
          </p>
        )}
        {undoState.error && <p role="alert">{undoState.error}</p>}
        {tab === 'Transcript' && (
          <TranscriptTab
            transcript={transcript}
            gaps={meeting.gaps}
            fontPx={fontPx}
            positionMs={playback.positionMs}
            showPosition={playback.isPlaying || playback.positionMs > 0 || placed}
            playing={playback.isPlaying}
            jump={jump}
            restoreKey={meetingId}
            onPlay={playback.play}
            editing={editing}
            onEditorOpenChange={setEditorOpen}
            onPlace={(ms) => {
              if (playback.isPlaying) playback.play(ms);
              else {
                setPlaced(true);
                playback.setPosition(ms);
              }
            }}
          />
        )}
        {tab === 'Summary' && (
          <SummaryTab
            meeting={meeting}
            defaultLength={settings.summaryDefaultLength}
            onPlay={playback.play}
          />
        )}
        {tab === 'Audio' && <AudioTab meeting={meeting} onOpenAudio={() => openFolder('audio')} />}
      </div>

      {!live && (
        <div className={styles.playerRow}>
          <PlayerBar meeting={meeting} playback={playback} />
          {tab !== 'Transcript' && (
            <button type="button" className={styles.button} onClick={showInTranscript}>
              Show in transcript
            </button>
          )}
        </div>
      )}

      {dialog === 'export' && (
        <ExportDialog
          meeting={meeting}
          defaultLength={settings.summaryDefaultLength}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'edit' && (
        <EditDetailsDialog meeting={meeting} onSaved={onChanged} onClose={() => setDialog(null)} />
      )}
      {dialog === 'delete' && (
        <DeleteDialog
          meeting={meeting}
          onDeleted={(title) => onBack(`Deleted ${title}.`)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

interface MeetingDetailViewProps {
  meetingId: string;
  jumpMs: number | undefined;
  onBack(notice?: string): void;
}

export function MeetingDetailView({ meetingId, jumpMs, onBack }: MeetingDetailViewProps) {
  const backend = useBackend();
  const load = useCallback(
    (client: Backend) => client.call('getMeeting', { meetingId }),
    [meetingId],
  );
  const { state, reload } = useBackendData(load);
  const { state: settings } = useBackendData(loadSettings);

  useEffect(() => {
    const stops = [
      backend.on('summaryOutdated', reload),
      backend.on('summaryProgress', reload),
      backend.on('meetingChanged', (meeting) => {
        if (meeting.id === meetingId) reload();
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [backend, reload, meetingId]);

  if (state.status === 'failed') {
    return (
      <div className={styles.detailHead}>
        <button type="button" className={styles.back} onClick={() => onBack()}>
          ← Recordings
        </button>
        <p role="alert">{state.message}</p>
      </div>
    );
  }

  return (
    <DataView state={state}>
      {(meeting) => (
        <DataView state={settings}>
          {(loaded) => (
            <LoadedDetail
              key={meeting.id}
              meeting={meeting}
              settings={loaded}
              initialJumpMs={jumpMs}
              onBack={onBack}
              onChanged={reload}
            />
          )}
        </DataView>
      )}
    </DataView>
  );
}
