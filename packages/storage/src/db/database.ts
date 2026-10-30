import { rename } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { StorageError, UnsupportedVersionError } from '../errors.ts';
import { migrate } from './migrations.ts';

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

function isHealthy(db: DatabaseSync): boolean {
  const row = db.prepare('PRAGMA quick_check(1)').get() as { quick_check: string };
  return row.quick_check === 'ok';
}

export interface OpenedIndex {
  db: DatabaseSync;
  /** Set when the old index was unreadable and set aside. Settings and vocabulary start empty. */
  replacedCorruptIndex: string | null;
}

function openAndMigrate(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);
  try {
    applyPragmas(db);
    if (!isHealthy(db)) throw new StorageError('INDEX_CORRUPT', 'index failed its check');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Opens and upgrades the index. Meetings can be rebuilt from their folders, so a corrupt index is
 * moved aside and replaced rather than blocking the app; the old file is kept for the user.
 * An index from a newer build is not corrupt, and is refused.
 */
export async function openIndex(filePath: string): Promise<OpenedIndex> {
  try {
    return { db: openAndMigrate(filePath), replacedCorruptIndex: null };
  } catch (error) {
    if (error instanceof UnsupportedVersionError) throw error;
    const code = (error as { code?: string }).code;
    const message = String((error as Error).message);
    const corrupt =
      code === 'INDEX_CORRUPT' || /malformed|not a database|file is encrypted/i.test(message);
    if (!corrupt) throw error;
    const aside = `${filePath}.corrupt-${Date.now()}`;
    await rename(filePath, aside);
    return { db: openAndMigrate(filePath), replacedCorruptIndex: aside };
  }
}
