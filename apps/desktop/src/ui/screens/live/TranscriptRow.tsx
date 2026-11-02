import { memo } from 'react';
import type { KeyboardEvent } from 'react';
import type { MeetingId, Speaker, TranscriptSegment, WordRange } from '@scrb/contracts';
import { SpeakerLabel } from '../../components/speakers/SpeakerLabel.tsx';
import { formatElapsed } from '../../lib/format.ts';
import styles from './TranscriptView.module.css';

interface TranscriptRowProps {
  meetingId: MeetingId;
  segment: TranscriptSegment;
  speaker: Speaker | undefined;
  speakers: Speaker[];
  /** The selection, when it reaches this row. */
  range: WordRange | undefined;
  onSpeakerChanged(): void;
  /** Index of the first and last selected word in this row. Null when none is selected. */
  selectedFrom: number | null;
  selectedTo: number | null;
  cursorWord: number | null;
  playingMs: number | null;
}

/** The transcript's own keys must not act on a key pressed in a speaker menu or its dialog. */
const keepKeysInLabel = (event: KeyboardEvent) => event.stopPropagation();

export const TranscriptRow = memo(function TranscriptRow({
  meetingId,
  segment,
  speaker,
  speakers,
  range,
  onSpeakerChanged,
  selectedFrom,
  selectedTo,
  cursorWord,
  playingMs,
}: TranscriptRowProps) {
  return (
    <div className={styles.row} data-segment-id={segment.id}>
      <div className={styles.rowHeader}>
        {speaker ? (
          <span className={styles.speaker} onKeyDown={keepKeysInLabel}>
            <SpeakerLabel
              meetingId={meetingId}
              speaker={speaker}
              speakers={speakers}
              range={range}
              // Only the row being worked on is a Tab stop, or Tab walks every visible row.
              tabIndex={cursorWord !== null || range ? 0 : -1}
              onChanged={onSpeakerChanged}
            />
          </span>
        ) : (
          <span className={styles.speaker}>Unknown speaker</span>
        )}
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
