import { assertFormat, type FileFormat, type JsonObject } from './versioned.ts';

export type MeetingSource = 'recorded' | 'imported';

/**
 * - `recording`, `importing`: still being created.
 * - `ready`: normal meeting.
 * - `recovered`: recording ended in a crash; saved chunks kept.
 * - `finalPassRunning`: audio is sealed and being transcribed.
 * - `transcriptionFailed`: the final pass could not finish; the audio is kept.
 */
export type MeetingStatus =
  | 'recording'
  | 'importing'
  | 'ready'
  | 'recovered'
  | 'finalPassRunning'
  | 'transcriptionFailed';

const STATUSES: readonly string[] = [
  'recording',
  'importing',
  'ready',
  'recovered',
  'finalPassRunning',
  'transcriptionFailed',
];

/** `meeting.json`: what the index is rebuilt from, so it must hold every indexed fact. */
export interface MeetingMeta {
  schemaVersion: 1;
  id: string;
  title: string;
  /** Meeting date as shown to the user. Editable; an import defaults it to the file's date. */
  date: string;
  /** When the meeting entered this library. Fixed; retention counts from here. */
  createdAt: string;
  durationMs: number;
  source: MeetingSource;
  status: MeetingStatus;
  audioDeletedAt: string | null;
  /** Import-only: build or grow voice profiles from this file. Off unless the user chose it. */
  buildVoiceProfiles: boolean;
  /** Shown to the user. Plain text written by the app, never tool output. */
  transcriptionFailure?: string | null;
}

function validateMeeting(doc: JsonObject): MeetingMeta {
  assertFormat(typeof doc['id'] === 'string' && doc['id'] !== '', 'id');
  assertFormat(typeof doc['title'] === 'string', 'title');
  assertFormat(typeof doc['date'] === 'string' && !Number.isNaN(Date.parse(doc['date'])), 'date');
  assertFormat(typeof doc['createdAt'] === 'string', 'createdAt');
  assertFormat(typeof doc['durationMs'] === 'number', 'durationMs');
  assertFormat(doc['source'] === 'recorded' || doc['source'] === 'imported', 'source');
  assertFormat(STATUSES.includes(doc['status'] as string), 'status');
  assertFormat(doc['audioDeletedAt'] === null || typeof doc['audioDeletedAt'] === 'string', 'audio');
  assertFormat(typeof doc['buildVoiceProfiles'] === 'boolean', 'buildVoiceProfiles');
  const failure = doc['transcriptionFailure'];
  assertFormat(failure == null || typeof failure === 'string', 'transcriptionFailure');
  return doc as unknown as MeetingMeta;
}

export const MEETING_FORMAT: FileFormat<MeetingMeta> = {
  name: 'meeting.json',
  version: 1,
  upgrades: {},
  validate: validateMeeting,
};
