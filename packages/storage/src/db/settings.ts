import type { DatabaseSync } from 'node:sqlite';
import { StorageError } from '../errors.ts';

export type AutoDeletePeriod = 'never' | '30d' | '90d' | '180d' | '1y';
export type AutoDeleteScope = 'audio' | 'meeting';

export interface AutoDeleteSettings {
  period: AutoDeletePeriod;
  scope: AutoDeleteScope;
}

const PERIODS: readonly string[] = ['never', '30d', '90d', '180d', '1y'];
const SCOPES: readonly string[] = ['audio', 'meeting'];

export const AUTO_DELETE_KEY = 'storage.autoDelete';
export const DEFAULT_AUTO_DELETE: AutoDeleteSettings = { period: 'never', scope: 'audio' };

function isAutoDelete(value: unknown): value is AutoDeleteSettings {
  const candidate = value as Partial<AutoDeleteSettings> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    PERIODS.includes(candidate.period as string) &&
    SCOPES.includes(candidate.scope as string)
  );
}

/**
 * JSON values by key, in the index. The app core owns most keys; this package checks only the
 * ones it acts on, because a bad retention value must never reach the auto-delete job.
 */
export class SettingsStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (row === undefined) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    if (text === undefined) throw new StorageError('BAD_SETTING', `Cannot store ${key}`);
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, text);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  all(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as {
      key: string;
      value: string;
    }[];
    return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
  }

  /** An unreadable value falls back to Never, so a damaged setting cannot delete anything. */
  getAutoDelete(): AutoDeleteSettings {
    const value = this.get<unknown>(AUTO_DELETE_KEY, DEFAULT_AUTO_DELETE);
    return isAutoDelete(value) ? value : DEFAULT_AUTO_DELETE;
  }

  setAutoDelete(settings: AutoDeleteSettings): void {
    if (!isAutoDelete(settings)) throw new StorageError('BAD_SETTING', 'Bad auto-delete choice');
    this.set(AUTO_DELETE_KEY, settings);
  }
}
