import { memo } from 'react';
import type { TranscriptSegment } from '@scrb/contracts';
import { formatElapsed } from '../../lib/format.ts';
import styles from './TranscriptView.module.css';

interface TranscriptRowProps {
  segment: TranscriptSegment;
  speakerLabel: string;
  top: number;
  /** Index of the first and last selected word in this row. Null when none is selected. */
  selectedFrom: number | null;
  selectedTo: number | null;
  cursorWord: number | null;
  playingMs: number | null;
}

export const TranscriptRow = memo(function TranscriptRow({
  segment,
  speakerLabel,
  top,
  selectedFrom,
  selectedTo,
  cursorWord,
  playingMs,
}: TranscriptRowProps) {
  return (
    <div
      className={styles.row}
      data-segment-id={segment.id}
      style={{ transform: `translateY(${top}px)` }}
    >
      <div className={styles.rowHeader}>
        <span className={styles.speaker}>{speakerLabel}</span>
        <time className={styles.time}>{formatElapsed(segment.startMs)}</time>
      </div>
      <p className={styles.text}>
        {segment.words.map((word, index) => {
          const selected =
            selectedFrom !== null &&
            selectedTo !== null &&
            index >= selectedFrom &&
            index <= selectedTo;
          const playing = playingMs !== null && playingMs >= word.startMs && playingMs < word.endMs;
          return (
            <span key={word.id}>
              <span
                className={styles.word}
                data-word-id={word.id}
                data-state={word.state}
                data-selected={selected || undefined}
                data-cursor={cursorWord === index || undefined}
                data-playing={playing || undefined}
              >
                {word.text}
              </span>{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
});
