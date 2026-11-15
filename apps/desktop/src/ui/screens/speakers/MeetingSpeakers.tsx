import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Backend,
  MeetingId,
  MeetingListItem,
  Speaker,
  SpeakerId,
  TranscriptSegment,
  WordRange,
} from '@scrb/contracts';
import { Button } from '../../components/Button.tsx';
import { ActionDialog } from '../../components/Dialog.tsx';
import { SpeakerLabel } from '../../components/speakers/SpeakerLabel.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { ClipPlayer } from '../../lib/clip-player.ts';
import { usePauseSharedPlayback } from '../../lib/playback-context.tsx';
import { formatElapsed, formatMeetingDate } from '../../lib/format.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { useRemembered } from '../../lib/tab-memory.ts';
import { DataView } from '../Screen.tsx';
import fieldStyles from '../../components/Dialog.module.css';
import styles from './MeetingSpeakers.module.css';

// Enough for the common case. Later passages are split by selecting words in the transcript.
const SEGMENT_LIMIT = 500;
const UNAVAILABLE = new Set<MeetingListItem['status']>(['importing', 'deleting']);

const rangeOf = (segment: TranscriptSegment): WordRange => ({
  firstWordId: segment.words[0]?.id as string,
  lastWordId: segment.words[segment.words.length - 1]?.id as string,
});

interface SplitDialogProps {
  meetingId: MeetingId;
  speakers: Speaker[];
  segments: TranscriptSegment[];
  partial: boolean;
  onDone(): void;
  onCancel(): void;
}

function SplitDialog(props: SplitDialogProps) {
  const { meetingId, speakers, segments, partial, onDone, onCancel } = props;
  const backend = useBackend();
  const [speakerId, setSpeakerId] = useState<SpeakerId>(speakers[0]?.id ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  // Kept across retries, so a failure partway through never creates a second new speaker.
  const created = useRef<SpeakerId | null>(null);
  const moved = useRef(new Set<string>());
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const player = useRef<ClipPlayer | null>(null);
  const pauseShared = usePauseSharedPlayback();
  useEffect(() => {
    let current = true;
    backend.call('getMeeting', { meetingId }).then(
      (meeting) => current && setHasAudio(meeting.hasAudio),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [backend, meetingId]);
  useEffect(() => {
    const clip = new ClipPlayer(backend, (error) => {
      setPlayingId(null);
      setClipError(error);
    });
    player.current = clip;
    return () => {
      clip.stop();
      player.current = null;
    };
  }, [backend]);

  const preview = (segment: TranscriptSegment) => {
    setClipError(null);
    if (playingId === segment.id) {
      player.current?.stop();
      setPlayingId(null);
      return;
    }
    pauseShared();
    setPlayingId(segment.id);
    void player.current?.play(meetingId, segment.startMs, segment.endMs);
  };
  const own = segments.filter((segment) => segment.speakerId === speakerId);
  const name = newLabel.trim();

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setChosen(next);
  };

  const split = async () => {
    for (const segment of own.filter((item) => chosen.has(item.id))) {
      if (moved.current.has(segment.id)) continue;
      const range = rangeOf(segment);
      if (created.current === null) {
        const result = await backend.call('splitSpeaker', { meetingId, range, newLabel: name });
        created.current = result.speakerId;
      } else {
        const target = created.current;
        await backend.call('reassignSpeaker', { meetingId, range, speakerId: target });
      }
      moved.current.add(segment.id);
    }
    onDone();
  };

  return (
    <ActionDialog
      title="Split a speaker"
      confirmLabel="Split"
      disabled={name === '' || chosen.size === 0}
      onConfirm={split}
      onCancel={onCancel}
    >
      <p>Use this when two people were labeled as one. Tick what the other person said.</p>
      <label className={fieldStyles.field}>
        Speaker to split
        <select
          data-autofocus
          value={speakerId}
          onChange={(event) => {
            setSpeakerId(event.target.value);
            setChosen(new Set());
          }}
        >
          {speakers.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>
              {speaker.label}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldStyles.field}>
        New speaker name
        <input
          value={newLabel}
          maxLength={300}
          onChange={(event) => setNewLabel(event.target.value)}
        />
      </label>
      <fieldset className={styles.segments}>
        <legend className={styles.legend}>What the new speaker said</legend>
        {own.length === 0 && <p className={styles.muted}>Nothing to show for this speaker.</p>}
        {own.map((segment) => (
          <div key={segment.id} className={styles.row}>
            <label className={styles.segment}>
              <input
                type="checkbox"
                checked={chosen.has(segment.id)}
                onChange={() => toggle(segment.id)}
              />
              <span className={styles.time}>{formatElapsed(segment.startMs)}</span>
              <span>{segment.words.map((word) => word.text).join(' ')}</span>
            </label>
            <Button
              type="button"
              disabled={hasAudio !== true}
              aria-label={`${playingId === segment.id ? 'Stop' : 'Play'} passage at ${formatElapsed(segment.startMs)}`}
              onClick={() => preview(segment)}
            >
              {playingId === segment.id ? 'Stop' : 'Play'}
            </Button>
          </div>
        ))}
      </fieldset>
      {hasAudio === false && <p className={styles.muted}>Audio isn’t saved for this meeting.</p>}
      {clipError && <p role="alert">{clipError}</p>}
      {partial && (
        <p className={styles.muted}>
          Showing the start of this meeting. For later passages, select the words in the transcript.
        </p>
      )}
    </ActionDialog>
  );
}

function SpeakersOfMeeting({ meetingId, onChanged }: { meetingId: MeetingId; onChanged(): void }) {
  const load = useCallback(
    (backend: Backend) =>
      backend.call('getTranscript', { meetingId, offset: 0, limit: SEGMENT_LIMIT }),
    [meetingId],
  );
  const { state, reload } = useBackendData(load);
  const [splitting, setSplitting] = useState(false);

  const changed = () => {
    reload();
    onChanged();
  };

  return (
    <DataView state={state}>
      {(page) => (
        <div className={styles.speakers}>
          <ul className={styles.labels} aria-label="Speakers in this meeting">
            {page.speakers.map((speaker) => (
              <li key={speaker.id}>
                <SpeakerLabel
                  meetingId={meetingId}
                  speaker={speaker}
                  speakers={page.speakers}
                  onChanged={changed}
                />
              </li>
            ))}
          </ul>
          <Button onClick={() => setSplitting(true)}>Split a speaker…</Button>
          {splitting && (
            <SplitDialog
              meetingId={meetingId}
              speakers={page.speakers}
              segments={page.segments}
              partial={page.totalSegments > page.segments.length}
              onDone={() => {
                setSplitting(false);
                changed();
              }}
              onCancel={() => setSplitting(false)}
            />
          )}
        </div>
      )}
    </DataView>
  );
}

/** Fixes a single meeting's speakers: pick a meeting, then use each speaker's menu. */
export function MeetingSpeakers({
  meetings,
  onChanged,
}: {
  meetings: MeetingListItem[];
  onChanged(): void;
}) {
  const available = meetings.filter((meeting) => !UNAVAILABLE.has(meeting.status));
  const [meetingId, setMeetingId] = useRemembered<MeetingId | null>('speakers.meeting', null);
  const selected = available.some((meeting) => meeting.id === meetingId) ? meetingId : null;
  if (available.length === 0) return null;
  return (
    <section aria-labelledby="meeting-speakers">
      <h2 id="meeting-speakers" className={styles.heading}>
        Speakers in a meeting
      </h2>
      <p className={styles.muted}>Rename, merge or split the speakers of one meeting.</p>
      <label className={`${fieldStyles.field} ${styles.picker}`}>
        Meeting
        <select
          value={selected ?? ''}
          onChange={(event) => setMeetingId(event.target.value || null)}
        >
          <option value="">Choose a meeting…</option>
          {available.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {meeting.title} ({formatMeetingDate(meeting.startedAt)})
            </option>
          ))}
        </select>
      </label>
      {selected && <SpeakersOfMeeting key={selected} meetingId={selected} onChanged={onChanged} />}
    </section>
  );
}
