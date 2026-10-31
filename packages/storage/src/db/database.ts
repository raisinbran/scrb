import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { StorageError, UnsupportedVersionError } from '../errors.ts';
import { INDEX_VERSION, migrate, readIndexVersion } from './migrations.ts';

export type { DatabaseSync };

function applyPragmas(db: DatabaseSync): void {
  // Rollback journal, not WAL: the user picks the library location, WAL fails on network and
  // synced folders, and one file makes "nothing left behind" simple to check.
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA foreign_keys = ON');
  // Deleted names and voice data are zeroed on disk, not just unlinked from the b-tree.
  db.exec('PRAGMA secure_delete = ON');
}

function verify(db: DatabaseSync): void {
  const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
    throw new StorageError('INDEX_CORRUPT', 'The index integrity check failed.');
  }
  const badKeys = db.prepare('PRAGMA foreign_key_check').all();
  if (badKeys.length !== 0) {
    throw new StorageError('INDEX_CORRUPT', 'The index has invalid references.');
  }
}

function quoted(name: string): string {
  return '"' + name.replaceAll('"', '""') + '"';
}

function tableRows(db: DatabaseSync, table: string, columns: string[]): string[] {
  const selected = columns.map(quoted).join(', ');
  const rows = db.prepare(`SELECT ${selected} FROM ${quoted(table)}`).all();
  return rows
    .map((row) =>
      JSON.stringify(row, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    )
    .sort();
}

function currentTables(db: DatabaseSync): { name: string; columns: string[]; rows: string[] }[] {
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return names.map(({ name }) => {
    const schema = db.prepare(`PRAGMA table_info(${quoted(name)})`).all() as { name: string }[];
    const columns = schema.map((column) => column.name);
    return { name, columns, rows: tableRows(db, name, columns) };
  });
}

function verifyPreserved(db: DatabaseSync, before: ReturnType<typeof currentTables>): void {
  for (const table of before) {
    const rows = tableRows(db, table.name, table.columns);
    if (JSON.stringify(rows) !== JSON.stringify(table.rows)) {
      throw new StorageError(
        'INDEX_MIGRATION',
        `Index migration changed existing ${table.name} rows.`,
      );
    }
  }
}

export interface OpenedIndex {
  db: DatabaseSync;
  /** Kept for existing callers; corrupt indexes are no longer replaced. */
  replacedCorruptIndex: string | null;
}

/** Upgrade from a consistent SQLite snapshot; never silently rebuild index-only user data. */
export async function openIndex(filePath: string): Promise<OpenedIndex> {
  const db = new DatabaseSync(filePath);
  let snapshot: string | null = null;
  try {
    applyPragmas(db);
    verify(db);
    const version = readIndexVersion(db);
    if (version > INDEX_VERSION) {
      throw new UnsupportedVersionError('index.sqlite', version, INDEX_VERSION);
    }
    const upgrading = version > 0 && version < INDEX_VERSION;
    if (upgrading && filePath !== ':memory:') {
      snapshot = `${filePath}.upgrade-${randomUUID()}`;
      db.prepare('VACUUM INTO ?').run(snapshot);
      const copy = new DatabaseSync(snapshot);
      try {
        verify(copy);
        if (readIndexVersion(copy) !== version) {
          throw new StorageError('INDEX_SNAPSHOT', 'The index snapshot has a different version.');
        }
      } finally {
        copy.close();
      }
    }
    const existing = upgrading ? currentTables(db) : [];
    migrate(db);
    verify(db);
    if (readIndexVersion(db) !== INDEX_VERSION) {
      throw new StorageError('INDEX_MIGRATION', 'Index migration did not finish.');
    }
    verifyPreserved(db, existing);
    if (snapshot !== null) {
      await unlink(snapshot);
    }
    return { db, replacedCorruptIndex: null };
  } catch (error) {
    db.close();
    // Preserve failed upgrade snapshots for explicit recovery during Task 26.
    // A failed integrity check never moves/replaces the original index.
    throw error;
  }
}
