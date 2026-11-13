import { useEffect, useState } from 'react';
import type { Speaker, SpeakerId } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';
import { formatElapsed } from '../lib/format.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './MiniRecording.module.css';

/** A speaker counts as talking while their latest transcribed words end within this of the clock. */
const ACTIVE_WITHIN_MS = 4000;

interface LastHeard {
  meetingId: string;
  speakerId: SpeakerId;
  endMs: number;
}

/** Who spoke last, from transcript events only: labels and times, never the words. */
function useLastSpeaker(meetingId: string | null) {
  const backend = useBackend();
  const [heard, setHeard] = useState<LastHeard | null>(null);
  const [speakers, setSpeakers] = useState<Record<SpeakerId, Speaker>>({});
  useEffect(
    () =>
      backend.on('transcriptChanged', (event) => {
        if (event.speakers.length > 0) {
          setSpeakers((known) => ({
            ...known,
            ...Object.fromEntries(event.speakers.map((speaker) => [speaker.id, speaker])),
          }));
        }
        if (event.change.kind === 'realign') return;
        const latest = event.change.segments.reduce<{ speakerId: SpeakerId; endMs: number } | null>(
          (best, segment) => (best && best.endMs >= segment.endMs ? best : segment),
          null,
        );
        if (!latest) return;
        setHeard((previous) =>
          previous && previous.meetingId === event.meetingId && previous.endMs > latest.endMs
            ? previous
            : { meetingId: event.meetingId, speakerId: latest.speakerId, endMs: latest.endMs },
        );
      }),
    [backend],
  );
  const current = heard && heard.meetingId === meetingId ? heard : null;
  return {
    heard: current,
    label: current ? (speakers[current.speakerId]?.label ?? 'Speaker') : null,
  };
}

/** The small window shown over other apps: status and time only, never transcript text. */
export function MiniRecording() {
  const { recording, recordingAt, health, lag } = useRecordingStatus();
  const { heard, label } = useLastSpeaker(recording.meetingId);
  const [now, setNow] = useState(() => Date.now());
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
      </span>
      {/* One fixed-height slot: a warning takes it over, so the row above never moves. */}
      {warning ? (
        <span className={styles.slot} data-kind="warning">
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
