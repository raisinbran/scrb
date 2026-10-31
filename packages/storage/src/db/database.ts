import { randomUUID } from 'node:crypto';
import { readdir, rename, rm, stat, statfs, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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

interface IndexUpgradeChecks {
  /** Fault-injection seams for regression tests; production uses the default checks. */
  availableBytes?: bigint;
  afterSnapshot?: (path: string) => void;
  afterMigration?: (db: DatabaseSync) => void;
}

/** Upgrade from a consistent SQLite snapshot; never silently rebuild index-only user data. */
export async function openIndex(
  filePath: string,
  checks: IndexUpgradeChecks = {},
): Promise<OpenedIndex> {
  // A snapshot left behind by an interrupted upgrade may be the only intact old index.
  // Never resume from a newer index while that recovery evidence is unresolved.
  if (filePath !== ':memory:') {
    const parent = dirname(filePath);
    const names = await readdir(parent);
    const prefix = `${basename(filePath)}.upgrade-`;
    if (names.some((name) => name.startsWith(prefix))) {
      throw new StorageError(
        'INDEX_RECOVERY_REQUIRED',
        'An unfinished index upgrade needs review; the index and snapshot are preserved.',
      );
    }
    // Only an unverified copy has this name, so the index it came from was never migrated.
    const copying = `${basename(filePath)}.copying-`;
    await Promise.all(
      names
        .filter((name) => name.startsWith(copying))
        .map((name) => rm(join(parent, name), { force: true })),
    );
  }
  const db = new DatabaseSync(filePath);
  let snapshot: string | null = null;
  let copying: string | null = null;
  try {
    applyPragmas(db);
    verify(db);
    const version = readIndexVersion(db);
    if (version > INDEX_VERSION) {
      throw new UnsupportedVersionError('index.sqlite', version, INDEX_VERSION);
    }
    const upgrading = version > 0 && version < INDEX_VERSION;
    const existing = upgrading ? currentTables(db) : [];
    if (upgrading && filePath !== ':memory:') {
      const [file, volume] = await Promise.all([stat(filePath), statfs(dirname(filePath))]);
      const free = checks.availableBytes ?? BigInt(volume.bavail) * BigInt(volume.bsize);
      const required = BigInt(file.size) * 2n + 16n * 1024n * 1024n;
      if (free < required) {
        throw new StorageError(
          'INDEX_SPACE',
          'Not enough disk space to back up and upgrade the index.',
        );
      }
      const id = randomUUID();
      copying = `${filePath}.copying-${id}`;
      db.prepare('VACUUM INTO ?').run(copying);
      checks.afterSnapshot?.(copying);
      const copy = new DatabaseSync(copying);
      try {
        verify(copy);
        if (readIndexVersion(copy) !== version) {
          throw new StorageError('INDEX_SNAPSHOT', 'The index snapshot has a different version.');
        }
        try {
          verifyPreserved(copy, existing);
        } catch {
          throw new StorageError('INDEX_SNAPSHOT', 'The index snapshot differs from its source.');
        }
      } finally {
        copy.close();
      }
      snapshot = `${filePath}.upgrade-${id}`;
      await rename(copying, snapshot);
      copying = null;
    }
    migrate(db);
    checks.afterMigration?.(db);
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
    if (copying !== null) await rm(copying, { force: true });
    // Preserve failed upgrade snapshots for explicit recovery during Task 26.
    // A failed integrity check never moves/replaces the original index.
    throw error;
  }
}
