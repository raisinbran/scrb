import { appendFile, mkdir, readdir, rm } from 'node:fs/promises';
import * as path from 'node:path';

export const LOG_RETENTION_DAYS = 14;

const DAY_MS = 86_400_000;
const LOG_FILE = /^scrb-(\d{4}-\d{2}-\d{2})\.log$/;
const REDACTED = '[redacted]';

/** A plain token such as an ID, error code or state. Anything with spaces or slashes is not. */
const SAFE_STRING = /^[\w.:+-]{0,64}$/;

/** These never go in a log, however short or harmless the value looks. */
const BANNED_KEYS =
  /text|transcript|word|title|name|term|replacement|original|query|snippet|path|folder|message|stack|summary|audio/i;

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

function cleanValue(key: string, value: unknown): string | number | boolean | null {
  if (BANNED_KEYS.test(key)) return REDACTED;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'string' && SAFE_STRING.test(value)) return value;
  return REDACTED;
}

/** Keeps only the error's type: messages from the OS carry paths, and paths carry titles. */
export function errorFields(error: unknown): LogFields {
  const { name, code } = error as { name?: unknown; code?: unknown };
  return { error: name ?? 'Error', code: code ?? 'unknown' };
}

/**
 * One file per day; files older than 14 days are removed on open and when the day changes.
 * Fields are filtered here, not at call sites, so no caller can leak transcript text or audio
 * by mistake. Logging never throws: a full disk must not stop the app.
 */
export class Logger {
  private readonly dir: string;
  private readonly now: () => Date;
  private queue: Promise<unknown> = Promise.resolve();
  private currentDay: string | null = null;

  constructor(dir: string, now: () => Date = () => new Date()) {
    this.dir = dir;
    this.now = now;
  }

  log(level: LogLevel, event: string, fields: LogFields = {}): void {
    const at = this.now();
    const safeEvent = SAFE_STRING.test(event) ? event : 'invalid-event';
    const clean = Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => SAFE_STRING.test(key))
        .map(([key, value]) => [key, cleanValue(key, value)]),
    );
    const line = `${JSON.stringify({ at: at.toISOString(), level, event: safeEvent, ...clean })}\n`;
    const day = at.toISOString().slice(0, 10);
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        if (day !== this.currentDay) {
          this.currentDay = day;
          await this.prune();
        }
        await appendFile(path.join(this.dir, `scrb-${day}.log`), line);
      })
      .catch(() => undefined);
  }

  /** Waits for queued lines. For shutdown and tests. */
  async flush(): Promise<void> {
    await this.queue;
  }

  /** Removes log files older than the retention period; other files are left alone. */
  async prune(): Promise<string[]> {
    const cutoff = this.now().getTime() - LOG_RETENTION_DAYS * DAY_MS;
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const old = names.filter((name) => {
      const day = LOG_FILE.exec(name)?.[1];
      return day !== undefined && Date.parse(day) + DAY_MS <= cutoff;
    });
    await Promise.all(old.map((name) => rm(path.join(this.dir, name), { force: true })));
    return old;
  }
}
