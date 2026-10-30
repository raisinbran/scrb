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

function Profiles({
  profiles,
  onChanged,
}: {
  profiles: VoiceProfile[];
  onChanged(): void;
}) {
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
        {profiles.map((profile) => {
          const deleting = deletingId === profile.id;
          return (
            <li key={profile.id} className={styles.row} aria-busy={deleting}>
              <div className={styles.rowText}>
                <span className={profile.name ? styles.name : styles.unnamed}>
                  {nameOf(profile)}
                </span>
                <span className={styles.muted}>
                  {deleting
                    ? 'Deleting…'
                    : `${meetingsText(profile.meetingCount)} · Last heard ${formatMeetingDate(profile.lastHeardAt)}`}
                </span>
              </div>
              <div className={styles.actions}>
                <Button
                  disabled={deleting}
                  aria-label={`Rename ${nameOf(profile)}`}
                  onClick={() => setDialog({ kind: 'rename', profile })}
                >
                  Rename
                </Button>
                <Button
                  disabled={deleting || profiles.length < 2}
                  aria-label={`Merge ${nameOf(profile)}`}
                  onClick={() => setDialog({ kind: 'merge', profile })}
                >
                  Merge
                </Button>
                <Button
                  variant="danger"
                  disabled={deleting}
                  aria-label={`Delete ${nameOf(profile)}`}
                  onClick={() => setDialog({ kind: 'delete', profile })}
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
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
          <>
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
            <MeetingSpeakers meetings={meetings} onChanged={reload} />
          </>
        )}
      </DataView>
    </Screen>
  );
}
