import { useState } from 'react';
import type { Backend, MeetingListItem, SpeakerSuggestion, VoiceProfile } from '@scrb/contracts';
import { Button } from '../components/Button.tsx';
import { ActionDialog, ChoiceDialog, TextDialog } from '../components/Dialog.tsx';
import { useSpeakerSuggestions } from '../components/speakers/SpeakerSuggestions.tsx';
import { useBackend } from '../lib/backend-context.tsx';
import { formatMeetingDate } from '../lib/format.ts';
import { useAction } from '../lib/use-action.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, EmptyState, Screen } from './Screen.tsx';
import { MeetingSpeakers } from './speakers/MeetingSpeakers.tsx';
import { useProfilePreview } from './speakers/use-profile-preview.ts';
import styles from './SpeakersScreen.module.css';

const load = (backend: Backend) =>
  Promise.all([backend.call('listProfiles'), backend.call('listMeetings', {})]);

const nameOf = (profile: VoiceProfile) => profile.name ?? 'Unnamed voice';
const meetingsText = (count: number) => `${count} ${count === 1 ? 'meeting' : 'meetings'}`;

function SuggestionRow({
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
      <div className={styles.rowText}>
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

type ProfileDialog = { kind: 'rename' | 'merge' | 'delete'; profile: VoiceProfile } | null;

function ProfileRow({
  profile,
  deleting,
  canMerge,
  onDialog,
}: {
  profile: VoiceProfile;
  deleting: boolean;
  canMerge: boolean;
  onDialog(kind: 'rename' | 'merge' | 'delete'): void;
}) {
  const preview = useProfilePreview(profile.id);
  return (
    <li className={`${styles.row} ${styles.wrap}`} aria-busy={deleting}>
      <div className={styles.rowText}>
        <span className={profile.name ? styles.name : styles.unnamed}>{nameOf(profile)}</span>
        <span className={styles.muted}>
          {deleting
            ? 'Deleting…'
            : `${meetingsText(profile.meetingCount)} · Last heard ${formatMeetingDate(profile.lastHeardAt)}`}
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          disabled={deleting || preview.loading}
          aria-label={`${preview.playing === null ? 'Play sample of' : 'Stop sample of'} ${nameOf(profile)}`}
          onClick={() => void preview.play()}
        >
          {preview.playing === null ? 'Play sample' : 'Stop'}
        </Button>
        <Button
          disabled={deleting}
          aria-label={`Rename ${nameOf(profile)}`}
          onClick={() => onDialog('rename')}
        >
          Rename
        </Button>
        <Button
          disabled={deleting || !canMerge}
          aria-label={`Merge ${nameOf(profile)}`}
          onClick={() => onDialog('merge')}
        >
          Merge
        </Button>
        <Button
          variant="danger"
          disabled={deleting}
          aria-label={`Delete ${nameOf(profile)}`}
          onClick={() => onDialog('delete')}
        >
          Delete
        </Button>
      </div>
      {preview.message && (
        <p role="status" className={`${styles.muted} ${styles.clips}`}>
          {preview.message}
        </p>
      )}
      {preview.clips.length > 0 && (
        <ul
          className={`${styles.clipList} ${styles.clips}`}
          aria-label={`Samples of ${nameOf(profile)}`}
        >
          {preview.clips.map((clip, at) => (
            <li key={`${clip.meetingId}/${clip.startMs}`} className={styles.clip}>
              <div className={styles.rowText}>
                <span className={styles.muted}>
                  {clip.meetingTitle} · {formatMeetingDate(clip.date)}
                </span>
                <span>{clip.text}</span>
              </div>
              <Button
                aria-label={`${preview.playing === at ? 'Stop' : 'Play'} sample from ${clip.meetingTitle}`}
                onClick={() => void preview.play(at)}
              >
                {preview.playing === at ? 'Stop' : 'Play'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Profiles({ profiles, onChanged }: { profiles: VoiceProfile[]; onChanged(): void }) {
  const backend = useBackend();
  const [dialog, setDialog] = useState<ProfileDialog>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { error, run } = useAction();
  const close = () => setDialog(null);

  const rename = async (profile: VoiceProfile, name: string) => {
    await backend.call('renameSpeaker', {
      target: { kind: 'profile', profileId: profile.id },
      name,
    });
    close();
    onChanged();
  };

  const merge = async (profile: VoiceProfile, into: string) => {
    await backend.call('mergeSpeakers', { kind: 'profiles', from: profile.id, into });
    close();
    onChanged();
  };

  const remove = (profile: VoiceProfile) => {
    close();
    setDeletingId(profile.id);
    void run(async () => {
      await backend.call('deleteProfile', { profileId: profile.id });
      onChanged();
    }).finally(() => setDeletingId(null));
  };

  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {profiles.map((profile) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            deleting={deletingId === profile.id}
            canMerge={profiles.length >= 2}
            onDialog={(kind) => setDialog({ kind, profile })}
          />
        ))}
      </ul>
      {dialog?.kind === 'rename' && (
        <TextDialog
          title="Rename voice profile"
          label="Name"
          initial={dialog.profile.name ?? ''}
          confirmLabel="Rename"
          onConfirm={(name) => rename(dialog.profile, name)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'merge' && (
        <ChoiceDialog
          title={`Merge ${nameOf(dialog.profile)}`}
          label="Merge into"
          choices={profiles
            .filter((profile) => profile.id !== dialog.profile.id)
            .map((profile) => ({
              id: profile.id,
              label: `${nameOf(profile)} (${meetingsText(profile.meetingCount)})`,
            }))}
          confirmLabel="Merge"
          onConfirm={(into) => merge(dialog.profile, into)}
          onCancel={close}
        >
          <p>
            Both profiles become one voice. The profile you choose keeps its name, and{' '}
            {nameOf(dialog.profile)} is removed from this list.
          </p>
        </ChoiceDialog>
      )}
      {dialog?.kind === 'delete' && (
        <ActionDialog
          title={`Delete ${nameOf(dialog.profile)}?`}
          confirmLabel="Delete profile"
          danger
          onConfirm={async () => remove(dialog.profile)}
          onCancel={close}
        >
          <p>This removes the voice data for this profile and cannot be undone.</p>
        </ActionDialog>
      )}
    </>
  );
}

export function SpeakersScreen() {
  const { state, reload } = useBackendData(load);
  const { suggestions } = useSpeakerSuggestions();
  return (
    <Screen title="Speakers">
      <DataView state={state}>
        {([profiles, meetings]) => (
          <div className={styles.columns} data-testid="speakers-columns">
            <div className={styles.profileColumn} data-testid="voice-profile-column">
              {suggestions.length > 0 && (
                <section aria-labelledby="speaker-suggestions" className={styles.section}>
                  <h2 id="speaker-suggestions" className={styles.heading}>
                    Suggested matches
                  </h2>
                  <ul className={styles.list}>
                    {suggestions.map((suggestion) => (
                      <SuggestionRow
                        key={`${suggestion.meetingId}/${suggestion.speakerId}`}
                        suggestion={suggestion}
                        meetings={meetings}
                        onAnswered={reload}
                      />
                    ))}
                  </ul>
                </section>
              )}
              <section aria-labelledby="voice-profiles" className={styles.section}>
                <h2 id="voice-profiles" className={styles.heading}>
                  Voice profiles
                </h2>
                {profiles.length === 0 ? (
                  <EmptyState title="No voice profiles yet">
                    Profiles appear after your first recording.
                  </EmptyState>
                ) : (
                  <Profiles profiles={profiles} onChanged={reload} />
                )}
              </section>
            </div>
            <div className={styles.meetingColumn} data-testid="meeting-speakers-column">
              <MeetingSpeakers meetings={meetings} onChanged={reload} />
            </div>
          </div>
        )}
      </DataView>
    </Screen>
  );
}
