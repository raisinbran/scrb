import { useEffect, useState } from 'react';
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

/** The small window shown over other apps: status and time only, never transcript text. */
export function MiniRecording() {
  const { recording, recordingAt, health, lag } = useRecordingStatus();
  const { heard, label } = useLastSpeaker(recording.meetingId);
  const [now, setNow] = useState(() => Date.now());
  const [compact, setCompact] = useState(false);
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
      <p className={styles.mini} role="status">
        Not recording
      </p>
    );
  }
  const elapsed =
    recording.elapsedMs + (recording.status === 'recording' ? Math.max(0, now - recordingAt) : 0);
  const warning =
    health && health.level !== 'ok'
      ? (health.warnings[0]?.message ?? 'Recording needs attention')
      : lag && (lag.status === 'failed' || lag.status === 'lagging')
        ? 'Transcription behind'
        : null;
  const speaking = heard !== null && elapsed - heard.endMs <= ACTIVE_WITHIN_MS;
  return (
    <div className={styles.mini} role="status">
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
            aria-label={compact ? 'Make larger' : 'Make smaller'}
            title={compact ? 'Make larger' : 'Make smaller'}
            onClick={toggleCompact}
          >
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path
                d={compact ? 'M2 8l4-4 4 4' : 'M2 6h8'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.icon}
            aria-label="Show Scribe"
            title="Show Scribe"
            onClick={() => window.open(SHOW_MAIN_URL)}
          >
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path
                d="M2 10L10 2M4.5 2H10v5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
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
  );
}
