import type { DatabaseSync } from 'node:sqlite';
import { UnsupportedVersionError } from '../errors.ts';

/**
 * Ordered schema steps. `MIGRATIONS[n]` takes the index from version n to n+1. Never edit a step
 * that has shipped; add a new one and a test that starts from the version before it.
 * Rule for every step: no column may hold transcript text.
 */
export const MIGRATIONS: readonly string[] = [
  // 0 -> 1: meetings. Only what lists and date or title search need.
  `CREATE TABLE meetings (
     id TEXT PRIMARY KEY,
     folder TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     date TEXT NOT NULL,
     created_at TEXT NOT NULL,
     duration_ms INTEGER NOT NULL,
     source TEXT NOT NULL,
     status TEXT NOT NULL
   ) STRICT;
   CREATE INDEX meetings_date ON meetings(date);`,

  // 1 -> 2: settings.
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   ) STRICT;`,

  // 2 -> 3: vocabulary. Contexts point at a correction in a meeting's transcript.json, so the
  // surrounding words stay in the meeting folder and leave with it.
  `CREATE TABLE vocabulary_terms (
     id TEXT PRIMARY KEY,
     term TEXT NOT NULL UNIQUE COLLATE NOCASE,
     enabled INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE vocabulary_misheard (
     term_id TEXT NOT NULL REFERENCES vocabulary_terms(id) ON DELETE CASCADE,
     text TEXT NOT NULL COLLATE NOCASE,
     PRIMARY KEY (term_id, text)
   ) STRICT;
   CREATE TABLE vocabulary_contexts (
     term_id TEXT NOT NULL REFERENCES vocabulary_terms(id) ON DELETE CASCADE,
     meeting_id TEXT NOT NULL,
     correction_id TEXT NOT NULL,
     PRIMARY KEY (term_id, correction_id)
   ) STRICT;
   CREATE INDEX vocabulary_contexts_meeting ON vocabulary_contexts(meeting_id);`,

  // 3 -> 4: voice profiles. Number lists only, never audio.
  `CREATE TABLE voice_profiles (
     id TEXT PRIMARY KEY,
     name TEXT,
     model_id TEXT NOT NULL,
     embedding BLOB NOT NULL,
     sample_count INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE voice_profile_meetings (
     profile_id TEXT NOT NULL REFERENCES voice_profiles(id) ON DELETE CASCADE,
     meeting_id TEXT NOT NULL,
     PRIMARY KEY (profile_id, meeting_id)
   ) STRICT;
   CREATE INDEX voice_profile_meetings_meeting ON voice_profile_meetings(meeting_id);`,

  // 4 -> 5: auto-delete needs to know which meetings no longer have audio.
  `ALTER TABLE meetings ADD COLUMN audio_deleted_at TEXT;`,
];

export const INDEX_VERSION = MIGRATIONS.length;

function userVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

/**
 * Runs each step in its own transaction with its version bump, so a crash or a failing step
 * leaves the index whole at the last finished version.
 */
export function migrate(
  db: DatabaseSync,
  steps: readonly string[] = MIGRATIONS,
  target = steps.length,
): void {
  const current = userVersion(db);
  if (current > steps.length) {
    throw new UnsupportedVersionError('index.sqlite', current, steps.length);
  }
  for (let version = current; version < target; version += 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(steps[version] as string);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function readIndexVersion(db: DatabaseSync): number {
  return userVersion(db);
}
