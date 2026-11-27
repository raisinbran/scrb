import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Backend,
  MeetingId,
  Speaker,
  SpeakerId,
  TranscriptSegment,
  WordRange,
} from '@scrb/contracts';
import { Button } from '../../components/Button.tsx';
import { ChoiceDialog, TextDialog } from '../../components/Dialog.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { Avatar } from '../../components/speakers/Avatar.tsx';
import { ActionDialog } from '../../components/Dialog.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { ClipPlayer } from '../../lib/clip-player.ts';
import { usePauseSharedPlayback } from '../../lib/playback-context.tsx';
import { formatElapsed } from '../../lib/format.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView } from '../Screen.tsx';
import fieldStyles from '../../components/Dialog.module.css';
import styles from './MeetingSpeakers.module.css';

// Enough for the common case. Later passages are split by selecting words in the transcript.
const SEGMENT_LIMIT = 500;

// Matches the message the backend sends for an overlap refusal (see docs/handoffs).
const isOverlapRefusal = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'conflict' &&
  (error as { message?: unknown }).message === 'These words overlap other speech.';

const rangeOf = (segment: TranscriptSegment): WordRange => ({
  firstWordId: segment.words[0]?.id as string,
  lastWordId: segment.words[segment.words.length - 1]?.id as string,
});

interface SplitDialogProps {
  /** The speaker the dialog starts on. */
  initialSpeakerId?: SpeakerId;
  meetingId: MeetingId;
  speakers: Speaker[];
  segments: TranscriptSegment[];
  partial: boolean;
  onDone(): void;
  onCancel(): void;
}

export function SplitDialog(props: SplitDialogProps) {
  const { initialSpeakerId, meetingId, speakers, segments, partial, onDone, onCancel } = props;
  const backend = useBackend();
  const [speakerId, setSpeakerId] = useState<SpeakerId>(initialSpeakerId ?? speakers[0]?.id ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  // Kept across retries, so a failure partway through never creates a second new speaker.
  const created = useRef<SpeakerId | null>(null);
  const moved = useRef(new Set<string>());
  const [skipped, setSkipped] = useState<TranscriptSegment[]>([]);
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
    if (skipped.length > 0) {
      onDone();
      return;
    }
    const refused: TranscriptSegment[] = [];
    for (const segment of own.filter((item) => chosen.has(item.id))) {
      if (moved.current.has(segment.id)) continue;
      const range = rangeOf(segment);
      try {
        if (created.current === null) {
          const result = await backend.call('splitSpeaker', { meetingId, range, newLabel: name });
          created.current = result.speakerId;
        } else {
          const target = created.current;
          await backend.call('reassignSpeaker', { meetingId, range, speakerId: target });
        }
      } catch (error) {
        if (isOverlapRefusal(error)) {
          refused.push(segment);
          continue;
        }
        throw error;
      }
      moved.current.add(segment.id);
    }
    if (refused.length > 0) {
      setSkipped(refused);
      return;
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
            <IconButton
              disabled={hasAudio !== true}
              label={`${playingId === segment.id ? 'Stop' : 'Play'} passage at ${formatElapsed(segment.startMs)}`}
              icon={playingId === segment.id ? 'stop' : 'play'}
              tip={playingId === segment.id ? 'Stop' : 'Play'}
              onClick={() => preview(segment)}
            />
          </div>
        ))}
      </fieldset>
      {hasAudio === false && <p className={styles.muted}>Audio isn’t saved for this meeting.</p>}
      {clipError && <p role="alert">{clipError}</p>}
      {skipped.length > 0 && (
        <div role="status">
          <p>
            {skipped.length === 1
              ? '1 passage could not be moved because it overlaps other speech:'
              : `${skipped.length} passages could not be moved because they overlap other speech:`}
          </p>
          <ul>
            {skipped.map((segment) => (
              <li key={segment.id}>{formatElapsed(segment.startMs)}</li>
            ))}
          </ul>
          <p className={styles.muted}>The other passages were moved. Select Split to finish.</p>
        </div>
      )}
      {partial && (
        <p className={styles.muted}>
          Showing the start of this meeting. For later passages, select the words in the transcript.
        </p>
      )}
    </ActionDialog>
  );
}

type Open =
  { kind: 'rename' | 'merge'; speaker: Speaker } | { kind: 'split'; speaker: Speaker } | null;

/** The Speakers tab of a meeting: one row per speaker with Rename, Merge into and Split into. */
export function MeetingSpeakersTab({
  meetingId,
  onChanged,
}: {
  meetingId: MeetingId;
  onChanged(): void;
}) {
  const backend = useBackend();
  const load = useCallback(
    (source: Backend) =>
      source.call('getTranscript', { meetingId, offset: 0, limit: SEGMENT_LIMIT }),
    [meetingId],
  );
  const { state, reload } = useBackendData(load);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const changed = () => {
    close();
    reload();
    onChanged();
  };

  return (
    <DataView state={state}>
      {(page) => {
        const others = (speaker: Speaker) => page.speakers.filter(({ id }) => id !== speaker.id);
        return (
          <div className={styles.tab}>
            <ul className={styles.rows} aria-label="Speakers in this meeting">
              {page.speakers.map((speaker) => (
                <li key={speaker.id} className={styles.speaker}>
                  <Avatar name={speaker.label} onInset />
                  <span className={styles.name}>{speaker.label}</span>
                  <div className={styles.actions}>
                    <Button
                      aria-label={`Rename ${speaker.label}`}
                      onClick={() => setOpen({ kind: 'rename', speaker })}
                    >
                      Rename
                    </Button>
                    <Button
                      aria-label={`Merge ${speaker.label} into another speaker`}
                      disabled={others(speaker).length === 0}
                      onClick={() => setOpen({ kind: 'merge', speaker })}
                    >
                      Merge into…
                    </Button>
                    <Button
                      aria-label={`Split ${speaker.label} into two speakers`}
                      onClick={() => setOpen({ kind: 'split', speaker })}
                    >
                      Split into…
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {open?.kind === 'rename' && (
              <TextDialog
                title="Rename speaker"
                label="Name"
                initial={open.speaker.label}
                confirmLabel="Rename"
                onConfirm={async (name) => {
                  await backend.call('renameSpeaker', {
                    target: { kind: 'meetingSpeaker', meetingId, speakerId: open.speaker.id },
                    name,
                  });
                  changed();
                }}
                onCancel={close}
              />
            )}
            {open?.kind === 'merge' && (
              <ChoiceDialog
                title={`Merge ${open.speaker.label}`}
                label="Merge into"
                choices={others(open.speaker).map(({ id, label }) => ({ id, label }))}
                confirmLabel="Merge"
                onConfirm={async (into) => {
                  await backend.call('mergeSpeakers', {
                    kind: 'meetingSpeakers',
                    meetingId,
                    from: open.speaker.id,
                    into,
                  });
                  changed();
                }}
                onCancel={close}
              >
                <p>
                  Both speakers become one in this meeting. The speaker you choose keeps its name,
                  and {open.speaker.label} is removed from the list.
                </p>
              </ChoiceDialog>
            )}
            {open?.kind === 'split' && (
              <SplitDialog
                initialSpeakerId={open.speaker.id}
                meetingId={meetingId}
                speakers={page.speakers}
                segments={page.segments}
                partial={page.totalSegments > page.segments.length}
                onDone={changed}
                onCancel={close}
              />
            )}
          </div>
        );
      }}
    </DataView>
  );
}
