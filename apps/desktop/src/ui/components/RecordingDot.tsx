import type { TranscriptionLag } from '@scrb/contracts';
import { Tooltip } from './Tooltip.tsx';
import motion from './RecordingDot.module.css';

/** Transcription counts as running unless the backend says it is off or has not reported yet. */
export function isTranscribing(lag: TranscriptionLag | null): boolean {
  return lag !== null && lag.status !== 'off';
}

export function recordingTip(status: 'recording' | 'paused', transcribing: boolean): string {
  if (status === 'paused') return 'Recording paused';
  return transcribing ? 'Recording and transcription in progress' : 'Recording in progress';
}

/** The pulse class for a dot that shows a live recording; paused and idle dots get none. */
export const pulseClass = (status: string): string =>
  status === 'recording' ? (motion.pulse ?? '') : '';

/**
 * A recording dot with a tooltip. Focusable so keyboard users get the same text as hover.
 * Use it where the dot is not already inside a button.
 */
export function RecordingDot({
  status,
  transcribing,
  className,
}: {
  status: 'recording' | 'paused';
  transcribing: boolean;
  className?: string | undefined;
}) {
  const tip = recordingTip(status, transcribing);
  return (
    <Tooltip label={tip}>
      <span
        role="img"
        tabIndex={0}
        aria-label={tip}
        className={[className, pulseClass(status)].filter(Boolean).join(' ')}
        data-state={status}
      />
    </Tooltip>
  );
}
