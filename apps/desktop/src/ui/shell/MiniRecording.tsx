import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useBackend } from '../lib/backend-context.tsx';
import { isTranscribing, RecordingDot } from '../components/RecordingDot.tsx';
import { Tooltip } from '../components/Tooltip.tsx';
import { formatElapsed } from '../lib/format.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './MiniRecording.module.css';

/** Opening this address asks the main process to bring the app forward; it matches `SHOW_MAIN_URL` in main. */
const SHOW_MAIN_URL = 'scrb-app://show-main';
/** Likewise `COMPACT_URL` and `EXPAND_URL`: they shrink the window to its status row and back. */
const COMPACT_URL = 'scrb-app://mini-compact';
const EXPAND_URL = 'scrb-app://mini-expand';
/** And `HIDE_URL`: it hides this window while the recording goes on; the main window brings it back. */
const HIDE_URL = 'scrb-app://mini-hide';

/** The window's own title strip: it only drags the window. Hide sits with the other buttons. */
function TitleStrip() {
  return <div className={styles.strip} />;
}

/** A track counts as sounding while its level was above this within HOLD_MS (peaks arrive about once a second). */
const SPEAKING_DB = -40;
const HOLD_MS = 1800;
/** How long the last meeting speaker's name from the transcript may lend itself to the meeting track. */
const NAME_FRESH_MS = 8000;

type Track = 'mic' | 'meeting';

interface Activity {
  /** When each track was last clearly above the noise, in wall-clock ms; 0 for never. */
  loudAt: Record<Track, number>;
  /** Latest level of each track as 0..1, for the bars. */
  amp: Record<Track, number>;
  /** The last transcribed speaker of each track: a label only, never words. */
  names: Record<Track, { label: string; at: number } | null>;
}

const quiet = (): Activity => ({
  loudAt: { mic: 0, meeting: 0 },
  amp: { mic: 0, meeting: 0 },
  names: { mic: null, meeting: null },
});

const ampOf = (db: number): number => Math.min(Math.max((db + 60) / 60, 0.15), 1);

/**
 * Who is sounding now. The level meter says when a track is loud (about 1 s old at worst); the
 * transcript only supplies a name, which arrives seconds later. Only this window's meeting counts.
 */
function useActivity(meetingId: string | null): Activity {
  const backend = useBackend();
  const [state, setState] = useState<{ meetingId: string | null; activity: Activity }>({
    meetingId,
    activity: quiet(),
  });
  useEffect(() => {
    if (meetingId === null) return undefined;
    const update = (change: (activity: Activity) => Activity): void =>
      setState((previous) => ({
        meetingId,
        activity: change(previous.meetingId === meetingId ? previous.activity : quiet()),
      }));
    const offLevels = backend.on('levelMeter', ({ micDb, meetingDb }) => {
      const at = Date.now();
      update((activity) => ({
        ...activity,
        loudAt: {
          mic: micDb > SPEAKING_DB ? at : activity.loudAt.mic,
          meeting: meetingDb !== null && meetingDb > SPEAKING_DB ? at : activity.loudAt.meeting,
        },
        amp: { mic: ampOf(micDb), meeting: ampOf(meetingDb ?? -100) },
      }));
    });
    const offTranscript = backend.on('transcriptChanged', (event) => {
      if (event.meetingId !== meetingId || event.change.kind === 'realign') return;
      const labels = new Map(event.speakers.map((speaker) => [speaker.id, speaker.label]));
      const at = Date.now();
      update((activity) => {
        const names = { ...activity.names };
        for (const segment of event.change.kind === 'realign' ? [] : event.change.segments) {
          const label = labels.get(segment.speakerId);
          if (label) names[segment.track === 'microphone' ? 'mic' : 'meeting'] = { label, at };
        }
        return { ...activity, names };
      });
    });
    return () => {
      offLevels();
      offTranscript();
    };
  }, [backend, meetingId]);
  return state.meetingId === meetingId ? state.activity : quiet();
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Hide keeps the recording going; it is offered idle too, so the window is never stuck on screen. */
function HideButton() {
  return (
    <button
      type="button"
      className={styles.icon}
      aria-label="Hide mini window"
      data-tip="Hide (recording continues)"
      onClick={() => window.open(HIDE_URL)}
    >
      <Icon>
        <rect
          x="1.5"
          y="2"
          width="9"
          height="8"
          rx="1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M3.5 7.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </Icon>
    </button>
  );
}

/** The small window shown over other apps: status and time only, never transcript text. */
export function MiniRecording() {
  const { recording, recordingAt, health, lag } = useRecordingStatus();
  const activity = useActivity(recording.meetingId);
  const [now, setNow] = useState(() => Date.now());
  const backend = useBackend();
  const [compact, setCompact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const control = useCallback(
    (call: 'pauseRecording' | 'resumeRecording' | 'stopRecording') => {
      setBusy(true);
      setFailure(null);
      backend
        .call(call)
        .catch((error: unknown) =>
          setFailure(error instanceof Error ? error.message : 'The recording could not be changed'),
        )
        .finally(() => setBusy(false));
    },
    [backend],
  );
  const toggleCompact = (): void => {
    window.open(compact ? EXPAND_URL : COMPACT_URL);
    setCompact(!compact);
  };
  useEffect(() => {
    if (recording.status !== 'recording') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [recording.status]);

  const active = recording.status === 'recording' || recording.status === 'paused';
  if (!active) {
    return (
      <div className={styles.mini}>
        <TitleStrip />
        <div className={styles.idle}>
          <span className={styles.line}>
            <span role="status">Not recording</span>
            <span className={styles.buttons}>
              <HideButton />
            </span>
          </span>
        </div>
      </div>
    );
  }
  const elapsed =
    recording.elapsedMs + (recording.status === 'recording' ? Math.max(0, now - recordingAt) : 0);
  const warning =
    failure ??
    (health && health.level !== 'ok'
      ? (health.warnings[0]?.message ?? 'Recording needs attention')
      : null);
  const speakers = (['mic', 'meeting'] as const)
    .filter((track) => recording.status === 'recording' && now - activity.loudAt[track] < HOLD_MS)
    .map((track) => {
      const name = activity.names[track];
      const fresh = name !== null && now - name.at < NAME_FRESH_MS;
      const label = track === 'mic' ? (name?.label ?? 'You') : fresh ? name.label : 'Meeting';
      return { track, label, amp: activity.amp[track] };
    });
  return (
    <div className={styles.mini}>
      <TitleStrip />
      <div className={styles.body} role="status">
        <span className={styles.line}>
          <RecordingDot
            status={recording.status === 'paused' ? 'paused' : 'recording'}
            transcribing={isTranscribing(lag)}
            className={styles.dot}
          />
          {recording.status === 'recording' ? 'Recording' : 'Paused'}{' '}
          <Tooltip label="Elapsed recording time">
            <span className={styles.elapsed} tabIndex={0}>
              {formatElapsed(elapsed)}
            </span>
          </Tooltip>
          {compact && warning ? (
            <span className={styles.flag} role="img" aria-label={warning} title={warning}>
              !
            </span>
          ) : null}
          <span className={styles.buttons}>
            <button
              type="button"
              className={styles.icon}
              disabled={busy}
              aria-label={recording.status === 'recording' ? 'Pause recording' : 'Resume recording'}
              data-tip={recording.status === 'recording' ? 'Pause' : 'Resume'}
              onClick={() =>
                control(recording.status === 'recording' ? 'pauseRecording' : 'resumeRecording')
              }
            >
              <Icon>
                {recording.status === 'recording' ? (
                  <path d="M3.5 2v8M8.5 2v8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                ) : (
                  <path d="M3 2l7 4-7 4z" fill="currentColor" />
                )}
              </Icon>
            </button>
            <button
              type="button"
              className={styles.icon}
              disabled={busy}
              aria-label="Stop recording"
              data-tip="Stop and save"
              onClick={() => control('stopRecording')}
            >
              <Icon>
                <rect x="2.5" y="2.5" width="7" height="7" fill="currentColor" />
              </Icon>
            </button>
            <button
              type="button"
              className={styles.icon}
              aria-label={compact ? 'Make larger' : 'Make smaller'}
              data-tip={compact ? 'Make larger' : 'Make smaller'}
              onClick={toggleCompact}
            >
              <Icon>
                <path
                  d={compact ? 'M2 8l4-4 4 4' : 'M2 6h8'}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </Icon>
            </button>
            <HideButton />
            <button
              type="button"
              className={styles.icon}
              aria-label="Hide mini window"
              data-tip="Hide (recording continues)"
              onClick={() => window.open(HIDE_URL)}
            >
              <Icon>
                <rect
                  x="1.5"
                  y="2"
                  width="9"
                  height="8"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="M3.5 7.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </Icon>
            </button>
            <button
              type="button"
              className={styles.icon}
              aria-label="Show Scribe"
              data-tip="Open Scribe"
              onClick={() => window.open(SHOW_MAIN_URL)}
            >
              <Icon>
                <path
                  d="M2 10L10 2M4.5 2H10v5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </Icon>
            </button>
          </span>
        </span>
        {/* One fixed-height slot: a warning takes it over, so the row above never moves. */}
        {compact ? null : warning ? (
          <span className={styles.slot} data-kind="warning" title={warning}>
            {warning}
          </span>
        ) : (
          <span className={styles.slot} data-kind="speaker">
            {speakers.map((speaker) => (
              <span key={speaker.track} className={styles.who}>
                <span className={styles.name}>{speaker.label}</span>
                <span
                  className={styles.bars}
                  role="img"
                  aria-label="Speaking"
                  style={{ '--amp': speaker.amp } as CSSProperties}
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
