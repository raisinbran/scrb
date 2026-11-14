import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Speaker, SpeakerId } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';
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

/** The Hide control follows the platform: a round control at the top left on a Mac, a minus at the top right elsewhere. */
const onMac = (): boolean => /Mac/.test(navigator.userAgent);

/** The window's own title strip: it drags the window and holds the one Hide control (closing is not allowed). */
function TitleStrip() {
  const mac = onMac();
  return (
    <div className={styles.strip} data-platform={mac ? 'mac' : 'other'}>
      <button
        type="button"
        className={styles.hide}
        aria-label="Hide mini window"
        data-tip="Hide"
        onClick={() => window.open(HIDE_URL)}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M3 6h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}

/** A speaker counts as talking while their latest transcribed words end within this of the clock. */
const ACTIVE_WITHIN_MS = 4000;

interface Heard {
  meetingId: string;
  speakerId: SpeakerId;
  endMs: number;
  speakers: Record<SpeakerId, Speaker>;
}

/**
 * Who spoke last, from transcript events only: labels and times, never the words. Only the
 * recording this window shows counts: another meeting's events (a final pass, say) must neither
 * blank the indicator nor lend it a name, as speaker IDs can repeat across meetings. State carries
 * its meeting, so a new meeting starts clean.
 */
function useLastSpeaker(meetingId: string | null) {
  const backend = useBackend();
  const [heard, setHeard] = useState<Heard | null>(null);
  useEffect(() => {
    if (meetingId === null) return undefined;
    return backend.on('transcriptChanged', (event) => {
      if (event.meetingId !== meetingId) return;
      const latest =
        event.change.kind === 'realign'
          ? null
          : event.change.segments.reduce<{ speakerId: SpeakerId; endMs: number } | null>(
              (best, segment) => (best && best.endMs >= segment.endMs ? best : segment),
              null,
            );
      setHeard((previous) => {
        const own = previous && previous.meetingId === meetingId ? previous : null;
        const speakers = {
          ...own?.speakers,
          ...Object.fromEntries(event.speakers.map((speaker) => [speaker.id, speaker])),
        };
        const keep = !latest || (own !== null && own.endMs > latest.endMs);
        if (keep && own) return { ...own, speakers };
        if (!latest) return own ?? null;
        return { meetingId, speakerId: latest.speakerId, endMs: latest.endMs, speakers };
      });
    });
  }, [backend, meetingId]);
  const current = heard && heard.meetingId === meetingId ? heard : null;
  return {
    heard: current,
    label: current ? (current.speakers[current.speakerId]?.label ?? 'Speaker') : null,
  };
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      {children}
    </svg>
  );
}

/** The small window shown over other apps: status and time only, never transcript text. */
export function MiniRecording() {
  const { recording, recordingAt, health } = useRecordingStatus();
  const { heard, label } = useLastSpeaker(recording.meetingId);
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
        <p className={styles.idle} role="status">
          Not recording
        </p>
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
  const speaking = heard !== null && elapsed - heard.endMs <= ACTIVE_WITHIN_MS;
  return (
    <div className={styles.mini}>
      <TitleStrip />
      <div className={styles.body} role="status">
        <span className={styles.line}>
          <span className={styles.dot} data-state={recording.status} aria-hidden="true" />
          {recording.status === 'recording' ? 'Recording' : 'Paused'}{' '}
          <span className={styles.elapsed}>{formatElapsed(elapsed)}</span>
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
          <span className={styles.slot} data-kind="speaker" data-active={speaking}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
