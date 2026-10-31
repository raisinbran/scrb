import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { StorageError } from '../errors.ts';

export interface VocabularyContextRef {
  meetingId: string;
  correctionId: string;
}

export interface VocabularyTerm {
  id: string;
  term: string;
  enabled: boolean;
  misheard: string[];
  contexts: VocabularyContextRef[];
  createdAt: string;
  updatedAt: string;
}

interface VocabularyProvenance {
  forms: { text: string; preserved: number }[];
  sources: { text: string; meeting_id: string; correction_id: string }[];
}

interface VocabularyChange {
  id: string;
  beforeProvenance: VocabularyProvenance;
  afterProvenance: VocabularyProvenance;
  before: VocabularyTerm | null;
  after: VocabularyTerm | null;
  wasEdited: boolean;
  nowEdited: boolean;
}

interface TermRow {
  id: string;
  term: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function hydrate(db: DatabaseSync, row: TermRow): VocabularyTerm {
  const misheard = db
    .prepare('SELECT text FROM vocabulary_misheard WHERE term_id = ? ORDER BY text')
    .all(row.id) as unknown as { text: string }[];
  const contexts = db
    .prepare('SELECT meeting_id, correction_id FROM vocabulary_contexts WHERE term_id = ?')
    .all(row.id) as unknown as { meeting_id: string; correction_id: string }[];
  return {
    id: row.id,
    term: row.term,
    enabled: row.enabled === 1,
    misheard: misheard.map((item) => item.text),
    contexts: contexts.map((item) => ({
      meetingId: item.meeting_id,
      correctionId: item.correction_id,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export interface TermInput {
  term: string;
  misheard?: string[];
  context?: VocabularyContextRef;
}

function deletedKey(term: string): string {
  // A hash, so the marker does not keep the text of a term the user deleted.
  const key = term.normalize('NFC').toLocaleLowerCase('en-US');
  return `vocabulary.deleted.${createHash('sha256').update(key).digest('hex')}`;
}
function isMarked(db: DatabaseSync, key: string): boolean {
  return db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key) !== undefined;
}
function mark(db: DatabaseSync, key: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'true')").run(key);
}
/** The Vocabulary list. Entries are hints for later meetings, never a find-and-replace table. */
export class VocabularyStore {
  private readonly db: DatabaseSync;
  private undoStack: VocabularyChange[] = [];
  private redoStack: VocabularyChange[] = [];
  private readonly now: () => string;

  constructor(db: DatabaseSync, now: () => string) {
    this.db = db;
    this.now = now;
  }

  list(): VocabularyTerm[] {
    const rows = this.db.prepare('SELECT * FROM vocabulary_terms ORDER BY term').all();
    return (rows as unknown as TermRow[]).map((row) => hydrate(this.db, row));
  }

  get(id: string): VocabularyTerm | null {
    const row = this.db.prepare('SELECT * FROM vocabulary_terms WHERE id = ?').get(id);
    return row === undefined ? null : hydrate(this.db, row as unknown as TermRow);
  }

  private findByTerm(term: string): TermRow | undefined {
    const row = this.db.prepare('SELECT * FROM vocabulary_terms WHERE term = ?').get(term);
    return row as unknown as TermRow | undefined;
  }

  isUserEdited(id: string): boolean {
    return isMarked(this.db, `vocabulary.edited.${id}`);
  }

  /** Reconstruct missing links, but never resurrect deliberately deleted vocabulary. */
  reconcileRemember(input: TermInput): void {
    if (!input.context || isMarked(this.db, deletedKey(input.term))) return;
    const linked = this.db
      .prepare('SELECT term_id FROM vocabulary_contexts WHERE correction_id = ?')
      .get(input.context.correctionId);
    if (linked === undefined) this.remember(input);
  }

  /** Adds a term, or adds the misheard forms and context to the entry that already has it. */
  remember(input: TermInput): VocabularyTerm {
    const term = input.term.trim();
    if (term === '') throw new StorageError('EMPTY_TERM', 'A vocabulary term cannot be empty');
    const id = inTransaction(this.db, () => {
      const now = this.now();
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(deletedKey(term));
      const existing = this.findByTerm(term);
      const termId = existing?.id ?? randomUUID();
      if (existing === undefined) {
        this.db
          .prepare(
            'INSERT INTO vocabulary_terms (id, term, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
          )
          .run(termId, term, now, now);
      } else {
        this.db.prepare('UPDATE vocabulary_terms SET updated_at = ? WHERE id = ?').run(now, termId);
      }
      for (const text of input.misheard ?? []) {
        if (input.context) {
          this.db.prepare(
            'INSERT OR IGNORE INTO vocabulary_misheard (term_id, text, preserved) VALUES (?, ?, 0)',
          ).run(termId, text);
          this.db.prepare(
            'INSERT OR IGNORE INTO vocabulary_misheard_sources (term_id, text, meeting_id, correction_id) VALUES (?, ?, ?, ?)',
          ).run(termId, text, input.context.meetingId, input.context.correctionId);
        } else {
          this.db.prepare(
            'INSERT INTO vocabulary_misheard (term_id, text, preserved) VALUES (?, ?, 1) ON CONFLICT(term_id, text) DO UPDATE SET preserved = 1',
          ).run(termId, text);
        }
      }
      if (input.context !== undefined) {
        this.db
          .prepare(
            'INSERT OR IGNORE INTO vocabulary_contexts (term_id, meeting_id, correction_id) VALUES (?, ?, ?)',
          )
          .run(termId, input.context.meetingId, input.context.correctionId);
      }
      return termId;
    });
    return this.get(id) as VocabularyTerm;
  }

  update(id: string, changes: { term?: string; enabled?: boolean; misheard?: string[] }): void {
    const before = this.get(id);
    const beforeProvenance = this.provenance(id);
    const wasEdited = this.isUserEdited(id);
    inTransaction(this.db, () => {
      if (changes.term !== undefined) {
        this.db
          .prepare('UPDATE vocabulary_terms SET term = ? WHERE id = ?')
          .run(changes.term.trim(), id);
      }
      if (changes.enabled !== undefined) {
        this.db
          .prepare('UPDATE vocabulary_terms SET enabled = ? WHERE id = ?')
          .run(changes.enabled ? 1 : 0, id);
      }
      if (changes.misheard !== undefined) {
        this.db.prepare('DELETE FROM vocabulary_misheard_sources WHERE term_id = ?').run(id);
        this.db.prepare('DELETE FROM vocabulary_misheard WHERE term_id = ?').run(id);
        for (const text of new Set(changes.misheard)) {
          this.db.prepare(
            'INSERT INTO vocabulary_misheard (term_id, text, preserved) VALUES (?, ?, 1)',
          ).run(id, text);
        }
      }
      this.db
        .prepare('UPDATE vocabulary_terms SET updated_at = ? WHERE id = ?')
        .run(this.now(), id);
      mark(this.db, `vocabulary.edited.${id}`);
    });
    this.rememberChange({ id, before, after: this.get(id), wasEdited, nowEdited: true,
      beforeProvenance, afterProvenance: this.provenance(id) });
  }

  delete(id: string): void {
    const current = this.get(id);
    if (!current) return;
    const wasEdited = this.isUserEdited(id);
    const beforeProvenance = this.provenance(id);
    inTransaction(this.db, () => {
      mark(this.db, deletedKey(current.term));
      this.db.prepare('DELETE FROM vocabulary_terms WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(`vocabulary.edited.${id}`);
    });
    this.rememberChange({ id, before: current, after: null, wasEdited, nowEdited: false,
      beforeProvenance, afterProvenance: this.provenance(id) });
  }

  private provenance(id: string): VocabularyProvenance {
    return {
      forms: this.db.prepare(
        'SELECT text, preserved FROM vocabulary_misheard WHERE term_id = ? ORDER BY text',
      ).all(id) as { text: string; preserved: number }[],
      sources: this.db.prepare(
        'SELECT text, meeting_id, correction_id FROM vocabulary_misheard_sources WHERE term_id = ? ORDER BY text, correction_id',
      ).all(id) as { text: string; meeting_id: string; correction_id: string }[],
    };
  }

  undoState(): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 };
  }

  private rememberChange(change: VocabularyChange): void {
    if (JSON.stringify(change.before) === JSON.stringify(change.after)) return;
    this.undoStack.push(change);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(
    id: string,
    wanted: VocabularyTerm | null,
    previous: VocabularyTerm | null,
    edited: boolean,
    provenance: VocabularyProvenance,
  ): void {
    inTransaction(this.db, () => {
      this.db.prepare('DELETE FROM vocabulary_terms WHERE id = ?').run(id);
      if (wanted) {
        this.db
          .prepare(
            'INSERT INTO vocabulary_terms (id, term, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(id, wanted.term, wanted.enabled ? 1 : 0, wanted.createdAt, wanted.updatedAt);
        for (const form of provenance.forms) {
          this.db.prepare(
            'INSERT INTO vocabulary_misheard (term_id, text, preserved) VALUES (?, ?, ?)',
          ).run(id, form.text, form.preserved);
        }
        for (const source of provenance.sources) {
          this.db.prepare(
            'INSERT INTO vocabulary_misheard_sources (term_id, text, meeting_id, correction_id) VALUES (?, ?, ?, ?)',
          ).run(id, source.text, source.meeting_id, source.correction_id);
        }
        for (const context of wanted.contexts) {
          this.db
            .prepare(
              'INSERT INTO vocabulary_contexts (term_id, meeting_id, correction_id) VALUES (?, ?, ?)',
            )
            .run(id, context.meetingId, context.correctionId);
        }
        this.db.prepare('DELETE FROM settings WHERE key = ?').run(deletedKey(wanted.term));
      } else if (previous) {
        mark(this.db, deletedKey(previous.term));
      }
      if (edited) mark(this.db, `vocabulary.edited.${id}`);
      else this.db.prepare('DELETE FROM settings WHERE key = ?').run(`vocabulary.edited.${id}`);
    });
  }

  /** The term must be as expected, and its restored text must not belong to a newer entry. */
  private canRestore(
    id: string,
    expected: VocabularyTerm | null,
    wanted: VocabularyTerm | null,
  ): boolean {
    if (JSON.stringify(this.get(id)) !== JSON.stringify(expected)) return false;
    const holder = wanted ? this.findByTerm(wanted.term) : undefined;
    return holder === undefined || holder.id === id;
  }

  undo(): { canUndo: boolean; canRedo: boolean } {
    const change = this.undoStack.at(-1);
    if (!change) return this.undoState();
    if (!this.canRestore(change.id, change.after, change.before)) {
      // A stale entry stays stale, so dropping it lets older edits still be undone.
      this.undoStack.pop();
      throw new StorageError('VOCABULARY_CHANGED', 'Vocabulary changed since the edit.');
    }
    this.restore(change.id, change.before, change.after, change.wasEdited, change.beforeProvenance);
    this.undoStack.pop();
    this.redoStack.push(change);
    return this.undoState();
  }

  redo(): { canUndo: boolean; canRedo: boolean } {
    const change = this.redoStack.at(-1);
    if (!change) return this.undoState();
    if (!this.canRestore(change.id, change.before, change.after)) {
      this.redoStack.pop();
      throw new StorageError('VOCABULARY_CHANGED', 'Vocabulary changed since the undo.');
    }
    this.restore(change.id, change.after, change.before, change.nowEdited, change.afterProvenance);
    this.redoStack.pop();
    this.undoStack.push(change);
    return this.undoState();
  }

  /** Terms to bias recognition with, most recently touched first. */
  enabledTerms(limit = 200): VocabularyTerm[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM vocabulary_terms WHERE enabled = 1 ORDER BY updated_at DESC, term LIMIT ?',
      )
      .all(limit);
    return (rows as unknown as TermRow[]).map((row) => hydrate(this.db, row));
  }

  /**
   * Undoes what one remembered correction added. The term goes too if nothing else backs it.
   * Misheard forms stay when another correction still gives the term a context.
   */
  forgetCorrection(correctionId: string, originalText: string): void {
    // Provenance is keyed by correction ID, not the obsolete original-text argument.
    void originalText;
    inTransaction(this.db, () => {
      const owners = this.db
        .prepare('SELECT term_id FROM vocabulary_contexts WHERE correction_id = ?')
        .all(correctionId) as unknown as { term_id: string }[];
      for (const { term_id: termId } of owners) {
        this.db
          .prepare('DELETE FROM vocabulary_contexts WHERE term_id = ? AND correction_id = ?')
          .run(termId, correctionId);
        const left = this.db
          .prepare('SELECT COUNT(*) n FROM vocabulary_contexts WHERE term_id = ?')
          .get(termId) as { n: number };
        if (left.n === 0) {
          const row = this.db
            .prepare('SELECT enabled FROM vocabulary_terms WHERE id = ?')
            .get(termId) as { enabled: number } | undefined;
          if (row?.enabled === 1 && !this.isUserEdited(termId)) {
            this.db.prepare('DELETE FROM vocabulary_terms WHERE id = ?').run(termId);
          }
        }
      }
      const sources = this.db.prepare(
        'SELECT term_id, text FROM vocabulary_misheard_sources WHERE correction_id = ?',
      ).all(correctionId) as unknown as { term_id: string; text: string }[];
      this.db.prepare(
        'DELETE FROM vocabulary_misheard_sources WHERE correction_id = ?',
      ).run(correctionId);
      for (const source of sources) {
        const remaining = this.db.prepare(
          'SELECT 1 FROM vocabulary_misheard_sources WHERE term_id = ? AND text = ? LIMIT 1',
        ).get(source.term_id, source.text);
        if (remaining !== undefined) continue;
        this.db.prepare(
          'DELETE FROM vocabulary_misheard WHERE term_id = ? AND text = ? AND preserved = 0',
        ).run(source.term_id, source.text);
      }
    });
  }
}
