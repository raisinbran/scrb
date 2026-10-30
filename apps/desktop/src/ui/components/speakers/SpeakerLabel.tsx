import { useState } from 'react';
import type { MeetingId, Speaker, SpeakerId, WordRange } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { ChoiceDialog, TextDialog } from '../Dialog.tsx';
import { MenuButton, type MenuItem } from '../Menu.tsx';
import styles from './SpeakerLabel.module.css';

type OpenDialog = 'rename' | 'merge' | 'reassign' | 'split' | null;

interface SpeakerLabelProps {
  meetingId: MeetingId;
  speaker: Speaker;
  /** Every speaker in the meeting, for merge and reassign targets. */
  speakers: Speaker[];
  /** The selected words. Reassign and split work on a selection, so they appear only with one. */
  range?: WordRange;
  /** Called after any change. A host showing live text also gets `transcriptChanged`. */
  onChanged?: () => void;
}

/** A speaker's name in a meeting, opening a menu to rename, merge, reassign and split. */
export function SpeakerLabel({ meetingId, speaker, speakers, range, onChanged }: SpeakerLabelProps) {
  const backend = useBackend();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const others = speakers.filter((other) => other.id !== speaker.id);
  const choices = others.map(({ id, label }) => ({ id, label }));

  const finish = () => {
    setDialog(null);
    onChanged?.();
  };

  const items: MenuItem[] = [{ label: 'Rename…', onSelect: () => setDialog('rename') }];
  if (others.length > 0) items.push({ label: 'Merge into…', onSelect: () => setDialog('merge') });
  if (range && others.length > 0) {
    items.push({ label: 'Reassign selection…', onSelect: () => setDialog('reassign') });
  }
  if (range) items.push({ label: 'Split selection…', onSelect: () => setDialog('split') });

  const rename = async (name: string) => {
    const target = { kind: 'meetingSpeaker', meetingId, speakerId: speaker.id } as const;
    await backend.call('renameSpeaker', { target, name });
    finish();
  };
  const merge = async (into: SpeakerId) => {
    await backend.call('mergeSpeakers', {
      kind: 'meetingSpeakers',
      meetingId,
      from: speaker.id,
      into,
    });
    finish();
  };
  const reassign = async (speakerId: SpeakerId) => {
    await backend.call('reassignSpeaker', { meetingId, range: range as WordRange, speakerId });
    finish();
  };
  const split = async (newLabel: string) => {
    await backend.call('splitSpeaker', { meetingId, range: range as WordRange, newLabel });
    finish();
  };
  const close = () => setDialog(null);

  return (
    <>
      <MenuButton
        label={`Speaker: ${speaker.label}`}
        className={`${styles.label} ${styles[speaker.kind]}`}
        items={items}
      >
        {speaker.label}
      </MenuButton>
      {dialog === 'rename' && (
        <TextDialog
          title="Rename speaker"
          label="Name"
          initial={speaker.kind === 'named' ? speaker.label : ''}
          confirmLabel="Rename"
          onConfirm={rename}
          onCancel={close}
        />
      )}
      {dialog === 'merge' && (
        <ChoiceDialog
          title={`Merge ${speaker.label}`}
          label="Merge into"
          choices={choices}
          confirmLabel="Merge"
          onConfirm={merge}
          onCancel={close}
        >
          <p>Everything {speaker.label} said in this meeting moves to the speaker you choose.</p>
        </ChoiceDialog>
      )}
      {dialog === 'reassign' && (
        <ChoiceDialog
          title="Reassign selection"
          label="Speaker"
          choices={choices}
          confirmLabel="Reassign"
          onConfirm={reassign}
          onCancel={close}
        />
      )}
      {dialog === 'split' && (
        <TextDialog
          title="Split selection"
          label="New speaker name"
          confirmLabel="Split"
          onConfirm={split}
          onCancel={close}
        />
      )}
    </>
  );
}
