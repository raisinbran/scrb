import { assertFormat, type FileFormat, type JsonObject } from './versioned.ts';

export type Track = 'microphone' | 'meeting';
export type Pass = 'live' | 'final';

export interface Word {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface Segment {
  id: string;
  speakerId: string;
  track: Track;
  pass: Pass;
  words: Word[];
}

export interface Speaker {
  id: string;
  /** "You", "Speaker 1", and so on. */
  label: string;
  name: string | null;
  profileId: string | null;
  /** True once the user named this speaker; the final pass then keeps the name. */
  userNamed: boolean;
  /** Set when this speaker now counts as another one. Follow it to find the shown speaker. */
  mergedInto: string | null;
}

/** A span with no audio: `paused` by the user, or `gap` for lost audio. */
export interface Gap {
  id: string;
  kind: 'paused' | 'gap';
  startMs: number;
  endMs: number;
}

/** What the model said, kept beside the correction with its audio link. */
export interface CorrectionOriginal {
  text: string;
  startMs: number;
  endMs: number;
  speakerId: string;
  track: Track;
}

/**
 * - `active`: shown, and its words are frozen.
 * - `superseded`: absorbed by a wider correction; words stay frozen so undo can bring it back.
 * - `reverted`: the user took it back; words are no longer frozen.
 */
export type CorrectionState = 'active' | 'superseded' | 'reverted';

export interface Correction {
  id: string;
  /** Consecutive word IDs in reading order. The words themselves never leave the model layer. */
  wordIds: string[];
  replacement: string;
  original: CorrectionOriginal;
  remember: boolean;
  state: CorrectionState;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The user moved a span of one track to another speaker. Wins over any model label. It is a
 * time span, not word IDs, because it must still apply after the final pass replaces the words.
 */
export interface SpeakerOverride {
  id: string;
  track: Track;
  startMs: number;
  endMs: number;
  speakerId: string;
}

/** Before and after of one record; null means it did not exist on that side. */
export interface Patch<T> {
  id: string;
  before: T | null;
  after: T | null;
}

/** One undoable user edit. */
export interface HistoryEntry {
  id: string;
  label: string;
  corrections: Patch<Correction>[];
  speakers: Patch<Speaker>[];
  overrides: Patch<SpeakerOverride>[];
}

/** `transcript.json`. Model text lives in `segments`, user edits in the layers after it. */
export interface TranscriptFile {
  schemaVersion: 2;
  meetingId: string;
  /** Goes up by one on every save. */
  revision: number;
  speakers: Speaker[];
  segments: Segment[];
  gaps: Gap[];
  corrections: Correction[];
  speakerOverrides: SpeakerOverride[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

function validateTranscript(doc: JsonObject): TranscriptFile {
  assertFormat(typeof doc['meetingId'] === 'string', 'meetingId');
  assertFormat(Number.isInteger(doc['revision']), 'revision');
  for (const key of [
    'speakers',
    'segments',
    'gaps',
    'corrections',
    'speakerOverrides',
    'undoStack',
    'redoStack',
  ]) {
    assertFormat(Array.isArray(doc[key]), key);
  }
  for (const segment of doc['segments'] as Segment[]) {
    assertFormat(typeof segment.id === 'string', 'segment id');
    assertFormat(typeof segment.speakerId === 'string', 'segment speaker');
    assertFormat(Array.isArray(segment.words), 'segment words');
    for (const word of segment.words) {
      assertFormat(typeof word.id === 'string' && typeof word.text === 'string', 'word');
      assertFormat(typeof word.startMs === 'number' && typeof word.endMs === 'number', 'timing');
    }
  }
  for (const correction of doc['corrections'] as Correction[]) {
    assertFormat(typeof correction.replacement === 'string', 'correction text');
    assertFormat(Array.isArray(correction.wordIds) && correction.wordIds.length > 0, 'span');
    assertFormat(typeof correction.original?.text === 'string', 'correction original');
  }
  return doc as unknown as TranscriptFile;
}

export const TRANSCRIPT_FORMAT: FileFormat<TranscriptFile> = {
  name: 'transcript.json',
  version: 2,
  upgrades: {
    // v1 is the model layer alone, the shape a transcription worker writes before any edits.
    1: (doc) => ({
      ...doc,
      revision: 0,
      gaps: doc['gaps'] ?? [],
      corrections: [],
      speakerOverrides: [],
      undoStack: [],
      redoStack: [],
      speakers: (doc['speakers'] as JsonObject[]).map((speaker) => ({
        ...speaker,
        name: speaker['name'] ?? null,
        profileId: speaker['profileId'] ?? null,
        userNamed: false,
        mergedInto: null,
      })),
    }),
  },
  validate: validateTranscript,
};

export function emptyTranscript(meetingId: string): TranscriptFile {
  return {
    schemaVersion: 2,
    meetingId,
    revision: 0,
    speakers: [],
    segments: [],
    gaps: [],
    corrections: [],
    speakerOverrides: [],
    undoStack: [],
    redoStack: [],
  };
}
