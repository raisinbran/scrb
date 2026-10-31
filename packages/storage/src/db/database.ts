import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readFile, readdir, rename, rm, stat, statfs, unlink } from 'node:fs/promises';
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
  retainedSnapshot: boolean;
  /** Kept for existing callers; corrupt indexes are no longer replaced. */
  replacedCorruptIndex: string | null;
}

type UpgradePhase = 'copying' | 'snapshotVerified' | 'migrationVerified';
interface UpgradeJournal {
  attemptId: string;
  oldVersion: number;
  targetVersion: number;
  phase: UpgradePhase;
  snapshotHash: string | null;
}

async function sha256(file: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const part of createReadStream(file)) digest.update(part);
  return digest.digest('hex');
}

function journalPath(file: string): string {
  return `${file}.upgrade-state.json`;
}

async function saveJournal(file: string, state: UpgradeJournal): Promise<void> {
  const target = journalPath(file);
  const temporary = `${target}.tmp`;
  const handle = await open(temporary, 'w');
  try {
    await handle.writeFile(JSON.stringify(state));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}

async function loadJournal(file: string): Promise<UpgradeJournal | null> {
  let source: string;
  try {
    source = await readFile(journalPath(file), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const value = JSON.parse(source) as Partial<UpgradeJournal>;
  if (!/^[0-9a-f-]{36}$/.test(value.attemptId ?? '') ||
      !Number.isInteger(value.oldVersion) ||
      !Number.isInteger(value.targetVersion) ||
      !['copying', 'snapshotVerified', 'migrationVerified'].includes(value.phase ?? '') ||
      (value.snapshotHash !== null && !/^[0-9a-f]{64}$/.test(value.snapshotHash ?? ''))) {
    throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The index recovery record is invalid.');
  }
  return value as UpgradeJournal;
}

async function ordinaryFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

function verifyReadOnly(file: string): number {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    verify(db);
    return readIndexVersion(db);
  } finally {
    db.close();
  }
}

interface IndexUpgradeChecks {
  /** Fault-injection seams for regression tests; production uses the default checks. */
  availableBytes?: bigint;
  afterSnapshot?: (path: string) => void;
  afterMigration?: (db: DatabaseSync) => void;
  beforeSnapshotRemoval?: () => void;
  beforeMigration?: () => void;
}

/** Upgrade from a consistent SQLite snapshot; never silently rebuild index-only user data. */
export async function openIndex(
  filePath: string,
  checks: IndexUpgradeChecks = {},
): Promise<OpenedIndex> {
  let retainedSnapshot = false;
  if (filePath !== ':memory:') {
    const parent = dirname(filePath);
    const names = await readdir(parent);
    const prefix = basename(filePath);
    const temporaryJournalName = `${prefix}.upgrade-state.json.tmp`;
    if (names.includes(temporaryJournalName)) {
      await rm(join(parent, temporaryJournalName), { force: true }).catch(() => undefined);
    }
    const journal = await loadJournal(filePath);
    const managedCopy = journal && `${prefix}.copying-${journal.attemptId}`;
    const managedSnapshot = journal && `${prefix}.upgrade-${journal.attemptId}`;
    const unknown = names.filter((name) =>
      (name.startsWith(`${prefix}.copying-`) || name.startsWith(`${prefix}.upgrade-`)) &&
      name !== managedCopy && name !== managedSnapshot &&
      name !== `${prefix}.upgrade-state.json` && name !== temporaryJournalName,
    );
    if (unknown.length > 0) {
      throw new StorageError('INDEX_RECOVERY_REQUIRED', 'Unidentified index copies require review.');
    }
    if (journal?.phase === 'copying') {
      if (managedSnapshot && names.includes(managedSnapshot)) {
        throw new StorageError('INDEX_RECOVERY_REQUIRED', 'An interrupted index upgrade requires review.');
      }
      if (verifyReadOnly(filePath) !== journal.oldVersion) {
        throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The original index changed during copying.');
      }
      if (managedCopy && names.includes(managedCopy)) {
        const target = join(parent, managedCopy);
        if (!(await ordinaryFile(target))) {
          throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The incomplete index copy is untrusted.');
        }
        try {
          await unlink(target);
        } catch {
          throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The incomplete index copy is locked.');
        }
      }
      await rm(journalPath(filePath), { force: true });
    } else if (journal?.phase === 'snapshotVerified') {
      const target = join(parent, managedSnapshot as string);
      if (!names.includes(managedSnapshot as string) ||
          !(await ordinaryFile(target)) ||
          (await sha256(target)) !== journal.snapshotHash) {
        throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The interrupted index snapshot is untrusted.');
      }
      const snapshotDb = new DatabaseSync(target, { readOnly: true });
      try {
        verify(snapshotDb);
        if (readIndexVersion(snapshotDb) !== journal.oldVersion) {
          throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The snapshot version changed.');
        }
        const originalRows = currentTables(snapshotDb);
        // A normal SQLite open rolls back an interrupted write before examining live rows.
        const live = new DatabaseSync(filePath);
        try {
          verify(live);
          const version = readIndexVersion(live);
          if (version !== journal.oldVersion && version !== journal.targetVersion) {
            throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The live index version is unexpected.');
          }
          verifyPreserved(live, originalRows);
          if (version === journal.oldVersion) {
            await unlink(target);
            await rm(journalPath(filePath), { force: true });
          } else {
            await saveJournal(filePath, { ...journal, phase: 'migrationVerified' });
            retainedSnapshot = true;
          }
        } finally {
          live.close();
        }
      } finally {
        snapshotDb.close();
      }
    }
    if (journal?.phase === 'migrationVerified' ||
        (journal?.phase === 'snapshotVerified' && retainedSnapshot)) {
      const target = join(parent, managedSnapshot as string);
      if (names.includes(managedSnapshot as string)) {
        if (!(await ordinaryFile(target)) ||
            (await sha256(target)) !== journal.snapshotHash ||
            verifyReadOnly(target) !== journal.oldVersion ||
            verifyReadOnly(filePath) !== journal.targetVersion) {
          throw new StorageError('INDEX_RECOVERY_REQUIRED', 'An index copy failed verification.');
        }
        try {
          await unlink(target);
          if (await ordinaryFile(target)) retainedSnapshot = true;
        } catch {
          retainedSnapshot = true;
        }
      } else if (verifyReadOnly(filePath) !== journal.targetVersion) {
        throw new StorageError('INDEX_RECOVERY_REQUIRED', 'The live index failed verification.');
      }
      if (!retainedSnapshot) await rm(journalPath(filePath), { force: true });
    }
  }
  const db = new DatabaseSync(filePath);
  let snapshot: string | null = null;
  let copying: string | null = null;
  let upgrade: UpgradeJournal | null = null;
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
      upgrade = {
        attemptId: id, oldVersion: version, targetVersion: INDEX_VERSION,
        phase: 'copying', snapshotHash: null,
      };
      await saveJournal(filePath, upgrade);
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
      upgrade = { ...upgrade!, phase: 'snapshotVerified', snapshotHash: await sha256(snapshot) };
      await saveJournal(filePath, upgrade);
    }
    checks.beforeMigration?.();
    migrate(db);
    checks.afterMigration?.(db);
    verify(db);
    if (readIndexVersion(db) !== INDEX_VERSION) {
      throw new StorageError('INDEX_MIGRATION', 'Index migration did not finish.');
    }
    verifyPreserved(db, existing);
    if (snapshot !== null) {
      upgrade = { ...upgrade!, phase: 'migrationVerified' };
      await saveJournal(filePath, upgrade);
      try {
        checks.beforeSnapshotRemoval?.();
        await unlink(snapshot);
        if (await ordinaryFile(snapshot)) retainedSnapshot = true;
      } catch {
        retainedSnapshot = true;
      }
      if (!retainedSnapshot) await rm(journalPath(filePath), { force: true });
    }
    return { db, replacedCorruptIndex: null, retainedSnapshot };
  } catch (error) {
    db.close();
    if (copying !== null) {
      await rm(copying, { force: true });
      if (upgrade?.phase === 'copying') {
        await rm(journalPath(filePath), { force: true });
      }
    }
    // Preserve failed upgrade snapshots for explicit recovery during Task 26.
    // A failed integrity check never moves/replaces the original index.
    throw error;
  }
}
