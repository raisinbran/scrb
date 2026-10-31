import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { MeetingMeta, MeetingSource, MeetingStatus } from '../formats/meeting.ts';

export interface MeetingRow {
  id: string;
  folder: string;
  title: string;
  date: string;
  createdAt: string;
  durationMs: number;
  source: MeetingSource;
  status: MeetingStatus;
  audioDeletedAt: string | null;
}

interface RawRow {
  id: string;
  folder: string;
  title: string;
  date: string;
  created_at: string;
  duration_ms: number;
  source: MeetingSource;
  status: MeetingStatus;
  audio_deleted_at: string | null;
}

function toRow(raw: RawRow): MeetingRow {
  return {
    id: raw.id,
    folder: raw.folder,
    title: raw.title,
    date: raw.date,
    createdAt: raw.created_at,
    durationMs: raw.duration_ms,
    source: raw.source,
    status: raw.status,
    audioDeletedAt: raw.audio_deleted_at,
  };
}

export function upsertMeeting(db: DatabaseSync, meta: MeetingMeta, folder: string): void {
  db.prepare(
    `INSERT INTO meetings
       (id, folder, title, date, created_at, duration_ms, source, status, audio_deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       folder = excluded.folder, title = excluded.title, date = excluded.date,
       created_at = excluded.created_at, duration_ms = excluded.duration_ms,
       source = excluded.source, status = excluded.status,
       audio_deleted_at = excluded.audio_deleted_at`,
  ).run(
    meta.id,
    folder,
    meta.title,
    meta.date,
    meta.createdAt,
    meta.durationMs,
    meta.source,
    meta.status,
    meta.audioDeletedAt,
  );
}

export function getMeetingRow(db: DatabaseSync, id: string): MeetingRow | null {
  const raw = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as RawRow | undefined;
  return raw === undefined ? null : toRow(raw);
}

export function listMeetingRows(db: DatabaseSync): MeetingRow[] {
  const rows = db.prepare('SELECT * FROM meetings ORDER BY date DESC, id').all();
  return (rows as unknown as RawRow[]).map(toRow);
}

export interface MeetingFilter {
  /** Matched against title and date text. Empty matches all. */
  text?: string;
  fromDate?: string;
  toDate?: string;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function findMeetingRows(db: DatabaseSync, filter: MeetingFilter): MeetingRow[] {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filter.text !== undefined && filter.text !== '') {
    const pattern = `%${escapeLike(filter.text)}%`;
    clauses.push(`(title LIKE ? ESCAPE '\\' OR date LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern);
  }
  if (filter.fromDate !== undefined) {
    clauses.push('date >= ?');
    params.push(filter.fromDate);
  }
  if (filter.toDate !== undefined) {
    // A bare day must include that whole day, not stop at its first instant.
    clauses.push('substr(date, 1, length(?)) <= ?');
    params.push(filter.toDate, filter.toDate);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM meetings ${where} ORDER BY date DESC, id`;
  return (db.prepare(sql).all(...params) as unknown as RawRow[]).map(toRow);
}

/** Removes everything the index holds about a meeting. Terms and profiles themselves stay. */
export function deleteMeetingRows(db: DatabaseSync, id: string): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    db.prepare('DELETE FROM vocabulary_contexts WHERE meeting_id = ?').run(id);
    db.prepare('DELETE FROM vocabulary_misheard_sources WHERE meeting_id = ?').run(id);
    db.prepare(
      'DELETE FROM vocabulary_misheard WHERE preserved = 0 AND NOT EXISTS (SELECT 1 FROM vocabulary_misheard_sources AS source WHERE source.term_id = vocabulary_misheard.term_id AND source.text = vocabulary_misheard.text)',
    ).run();
    db.prepare('DELETE FROM voice_profile_meetings WHERE meeting_id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Names what the index still holds about a meeting. Empty means it is clean. */
export function indexTraces(db: DatabaseSync, id: string): string[] {
  const traces: string[] = [];
  const count = (sql: string): number => (db.prepare(sql).get(id) as { n: number }).n;
  if (count('SELECT COUNT(*) n FROM meetings WHERE id = ?') > 0) traces.push('index:meetings');
  if (count('SELECT COUNT(*) n FROM vocabulary_contexts WHERE meeting_id = ?') > 0) {
    traces.push('index:vocabulary_contexts');
  }
  if (count('SELECT COUNT(*) n FROM vocabulary_misheard_sources WHERE meeting_id = ?') > 0) {
    traces.push('index:vocabulary_misheard_sources');
  }
  if (count('SELECT COUNT(*) n FROM voice_profile_meetings WHERE meeting_id = ?') > 0) {
    traces.push('index:voice_profile_meetings');
  }
  return traces;
}
