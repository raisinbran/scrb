import { useEffect, useRef, useState } from 'react';
import type { Backend, MeetingListItem, SpeakerSuggestion, VoiceProfile } from '@scrb/contracts';
import { Button } from '../components/Button.tsx';
import { IconButton } from '../components/IconButton.tsx';
import { ActionDialog, ChoiceDialog, TextDialog } from '../components/Dialog.tsx';
import { Tooltip } from '../components/Tooltip.tsx';
import { Avatar } from '../components/speakers/Avatar.tsx';
import { useSpeakerSuggestions } from '../components/speakers/SpeakerSuggestions.tsx';
import { PopupBanner, PopupLayer } from '../components/PopupBanner.tsx';
import list from '../components/ListItem.module.css';
import { useBackend } from '../lib/backend-context.tsx';
import { formatMeetingDate } from '../lib/format.ts';
import { useRemembered } from '../lib/tab-memory.ts';
import { useAction } from '../lib/use-action.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, EmptyState } from './Screen.tsx';
import { SplitLayout } from './SplitLayout.tsx';
import { useProfilePreview } from './speakers/use-profile-preview.ts';
import styles from './SpeakersScreen.module.css';

const load = (backend: Backend) =>
  Promise.all([backend.call('listProfiles'), backend.call('listMeetings', {})]);

const nameOf = (profile: VoiceProfile) => profile.name ?? 'Unnamed voice';
const meetingsText = (count: number) => `${count} ${count === 1 ? 'meeting' : 'meetings'}`;

const SPLIT_TIP = 'To split a speaker, open the meeting in Recordings and use its Speakers tab.';

function SuggestionCard({
  suggestion,
  meetings,
  onAnswered,
}: {
  suggestion: SpeakerSuggestion;
  meetings: MeetingListItem[];
  onAnswered(): void;
}) {
  const { answer } = useSpeakerSuggestions();
  const { busy, error, run } = useAction();
  const title = meetings.find((meeting) => meeting.id === suggestion.meetingId)?.title;
  const respond = (accepted: boolean) =>
    void run(async () => {
      await answer(suggestion, accepted);
      onAnswered();
    });
  return (
    <li className={styles.suggestion}>
      <div className={styles.text}>
        <span>Could this be {suggestion.profileName}?</span>
        <span className={styles.muted}>
          An unnamed voice in {title ?? 'a meeting'} sounds like this profile.
        </span>
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="primary" disabled={busy} onClick={() => respond(true)}>
          Yes, same person
        </Button>
        <Button disabled={busy} onClick={() => respond(false)}>
          No
        </Button>
      </div>
    </li>
  );
}

type Dialog = 'rename' | 'merge' | 'delete' | null;

function Detail({
  profile,
  profiles,
  deleting,
  onChanged,
  onDelete,
}: {
  profile: VoiceProfile;
  profiles: VoiceProfile[];
  deleting: boolean;
  onChanged(): void;
  onDelete(): void;
}) {
  const backend = useBackend();
  const preview = useProfilePreview(profile.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const name = nameOf(profile);
  const others = profiles.filter((other) => other.id !== profile.id);
  const playing = preview.playing !== null;

  return (
    <>
      <section aria-labelledby="speaker-name" className={styles.panel} aria-busy={deleting}>
        <div className={styles.head}>
          <Avatar name={name} large />
          <div className={styles.text}>
            <h2 id="speaker-name" className={profile.name ? styles.title : styles.titleUnnamed}>
              {name}
            </h2>
            <p className={styles.muted}>
              {deleting
                ? 'Deleting…'
                : `${meetingsText(profile.meetingCount)} · Last heard ${formatMeetingDate(profile.lastHeardAt)}`}
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <Button
            disabled={deleting || preview.loading}
            aria-label={`${playing ? 'Stop sample of' : 'Play sample of'} ${name}`}
            onClick={() => void preview.play()}
          >
            {playing ? 'Stop sample' : 'Play sample'}
          </Button>
          <Button
            disabled={deleting}
            aria-label={`Rename ${name}`}
            onClick={() => setDialog('rename')}
          >
            Rename
          </Button>
          <Button
            disabled={deleting || others.length === 0}
            aria-label={`Merge ${name} into another voice`}
            onClick={() => setDialog('merge')}
          >
            Merge into…
          </Button>
          <Tooltip label={SPLIT_TIP}>
            <Button aria-disabled="true" aria-label={`Split ${name} into two voices`}>
              Split into…
            </Button>
          </Tooltip>
          <Button
            variant="danger"
            disabled={deleting}
            aria-label={`Delete ${name}`}
            onClick={() => setDialog('delete')}
          >
            Delete
          </Button>
        </div>
        {preview.message && (
          <p role="status" className={styles.muted}>
            {preview.message}
          </p>
        )}
      </section>
      {preview.clips.length > 0 && (
        <section aria-labelledby="speaker-samples" className={styles.panel}>
          <h3 id="speaker-samples" className={styles.subheading}>
            Samples
          </h3>
          <ul className={styles.clips} aria-label={`Samples of ${name}`}>
            {preview.clips.map((clip, at) => (
              <li key={`${clip.meetingId}/${clip.startMs}`} className={styles.clip}>
                <div className={styles.text}>
                  <span className={styles.muted}>
                    {clip.meetingTitle} · {formatMeetingDate(clip.date)}
                  </span>
                  <span>{clip.text}</span>
                </div>
                <IconButton
                  label={`${preview.playing === at ? 'Stop' : 'Play'} sample from ${clip.meetingTitle}`}
                  icon={preview.playing === at ? 'stop' : 'play'}
                  tip={preview.playing === at ? 'Stop' : 'Play'}
                  onClick={() => void preview.play(at)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {dialog === 'rename' && (
        <TextDialog
          title="Rename voice profile"
          label="Name"
          initial={profile.name ?? ''}
          confirmLabel="Rename"
          onConfirm={async (next) => {
            await backend.call('renameSpeaker', {
              target: { kind: 'profile', profileId: profile.id },
              name: next,
            });
            close();
            onChanged();
          }}
          onCancel={close}
        />
      )}
      {dialog === 'merge' && (
        <ChoiceDialog
          title={`Merge ${name}`}
          label="Merge into"
          choices={others.map((other) => ({
            id: other.id,
            label: `${nameOf(other)} (${meetingsText(other.meetingCount)})`,
          }))}
          confirmLabel="Merge"
          onConfirm={async (into) => {
            await backend.call('mergeSpeakers', { kind: 'profiles', from: profile.id, into });
            close();
            onChanged();
          }}
          onCancel={close}
        >
          <p>
            Both profiles become one voice. The profile you choose keeps its name, and {name} is
            removed from this list.
          </p>
        </ChoiceDialog>
      )}
      {dialog === 'delete' && (
        <ActionDialog
          title={`Delete ${name}?`}
          confirmLabel="Delete profile"
          danger
          onConfirm={async () => {
            close();
            onDelete();
          }}
          onCancel={close}
        >
          <p>This removes the voice data for this profile and cannot be undone.</p>
        </ActionDialog>
      )}
    </>
  );
}

function Rows({
  profiles,
  selectedId,
  deletingId,
  onSelect,
  listRef,
}: {
  profiles: VoiceProfile[];
  selectedId: string | null;
  deletingId: string | null;
  onSelect(id: string): void;
  listRef: React.RefObject<HTMLUListElement | null>;
}) {
  return (
    <ul className={list.list} aria-label="Voice profiles" ref={listRef}>
      {profiles.map((profile) => (
        <li key={profile.id}>
          <button
            type="button"
            className={`${list.item} ${styles.row}`}
            aria-current={profile.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(profile.id)}
          >
            <Avatar name={nameOf(profile)} />
            <span className={styles.rowText}>
              <span className={profile.name ? styles.rowName : styles.rowUnnamed}>
                {nameOf(profile)}
              </span>
              <span className={styles.muted}>
                {deletingId === profile.id ? 'Deleting…' : meetingsText(profile.meetingCount)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Loaded({
  profiles,
  meetings,
  onChanged,
}: {
  profiles: VoiceProfile[];
  meetings: MeetingListItem[];
  onChanged(): void;
}) {
  const backend = useBackend();
  const { suggestions } = useSpeakerSuggestions();
  const [picked, setPicked] = useRemembered<string | null>('speakers.profile', null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { error, run } = useAction();
  const selected = profiles.find((profile) => profile.id === picked) ?? profiles[0] ?? null;
  const listRef = useRef<HTMLUListElement>(null);
  const refocus = useRef(false);

  // After a delete the detail card unmounts; keep keyboard focus in the list.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [profiles]);

  const remove = (profile: VoiceProfile) => {
    setDismissed(false);
    setDeletingId(profile.id);
    void run(async () => {
      await backend.call('deleteProfile', { profileId: profile.id });
      refocus.current = true;
      onChanged();
    }).finally(() => setDeletingId(null));
  };

  return (
    <SplitLayout
      title="Speakers"
      list={
        profiles.length === 0 ? (
          <div className={styles.listEmpty}>
            <EmptyState compact title="No voice profiles yet">
              Profiles appear after your first recording.
            </EmptyState>
          </div>
        ) : (
          <Rows
            profiles={profiles}
            selectedId={selected?.id ?? null}
            deletingId={deletingId}
            onSelect={setPicked}
            listRef={listRef}
          />
        )
      }
    >
      <div className={styles.content} data-testid="speaker-detail">
        <div className={styles.popups}>
          <PopupLayer>
            {error && !dismissed && (
              <PopupBanner level="danger" role="alert" onDismiss={() => setDismissed(true)}>
                <p>{error}</p>
              </PopupBanner>
            )}
          </PopupLayer>
        </div>
        {suggestions.length > 0 && (
          <section aria-labelledby="speaker-suggestions" className={styles.panel}>
            <h2 id="speaker-suggestions" className={styles.subheading}>
              Suggested matches
            </h2>
            <ul className={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={`${suggestion.meetingId}/${suggestion.speakerId}`}
                  suggestion={suggestion}
                  meetings={meetings}
                  onAnswered={onChanged}
                />
              ))}
            </ul>
          </section>
        )}
        {selected ? (
          <Detail
            key={selected.id}
            profile={selected}
            profiles={profiles}
            deleting={deletingId === selected.id}
            onChanged={onChanged}
            onDelete={() => remove(selected)}
          />
        ) : (
          <div className={styles.emptyPanel} data-testid="speaker-empty">
            {profiles.length === 0 ? (
              <EmptyState title="Voices will appear here">
                After a recording, each speaker's voice is listed here so you can name it.
              </EmptyState>
            ) : (
              <p className={styles.muted}>Select a voice</p>
            )}
          </div>
        )}
      </div>
    </SplitLayout>
  );
}

export function SpeakersScreen() {
  const { state, reload } = useBackendData(load);
  return (
    <DataView state={state}>
      {([profiles, meetings]) => (
        <Loaded profiles={profiles} meetings={meetings} onChanged={reload} />
      )}
    </DataView>
  );
}
