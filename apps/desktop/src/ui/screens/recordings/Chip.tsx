import styles from './recordings.module.css';

/** Short forms for the narrow list; the full text stays in the tooltip and for screen readers. */
const COMPACT_LABELS: Record<string, string> = {
  'Processing final transcript': 'Processing',
  'Recovered after crash': 'Recovered',
  'Transcription failed': 'Failed',
  'Summary generating': 'Generating',
};

/** The one status or summary tag, in the list rows and in the meeting header. */
export function Chip({
  text,
  className,
  busy = false,
  full = false,
}: {
  text: string;
  className: string | undefined;
  /** Marks the chip the progress bar sits next to. */
  busy?: boolean;
  /** Wide places show the whole wording instead of the short form. */
  full?: boolean;
}) {
  const short = full ? undefined : COMPACT_LABELS[text];
  const mark = busy ? { 'data-busy-chip': '' } : {};
  if (!short)
    return (
      <span className={className} {...mark}>
        {text}
      </span>
    );
  return (
    <span className={className} title={text} {...mark}>
      <span aria-hidden="true">{short}</span>
      <span className={styles.srOnly}>{text}</span>
    </span>
  );
}
