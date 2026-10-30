import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const TEMP_MARKER = '.tmp-';

/** Steps of an atomic write. Tests stop at each one to prove a crash leaves the old file whole. */
export type WriteStep = 'temp-created' | 'temp-partly-written' | 'temp-synced' | 'renamed';

export interface AtomicWriteOptions {
  /** Test hook: runs after each step. Throwing simulates a crash at that point. */
  onStep?: (step: WriteStep, tempPath: string) => void | Promise<void>;
}

const RENAME_RETRIES = 6;
const RENAME_RETRY_MS = 50;

/** Windows antivirus and indexers briefly hold new files open, so renames can fail transiently. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!transient || attempt >= RENAME_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS * (attempt + 1)));
    }
  }
}

/** Flush the directory so the rename itself survives power loss. Windows cannot open directories. */
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await fs.open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Writes to a temporary name in the same folder, flushes, then renames over the target.
 * A reader sees the old file or the new one, never a mixture. A crash leaves at most a stray
 * temp file, which `removeTempFiles` clears on the next open.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(dir, `${base}${TEMP_MARKER}${randomBytes(6).toString('hex')}`);
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const { onStep } = options;

  const handle = await fs.open(tempPath, 'wx');
  try {
    await onStep?.('temp-created', tempPath);
    const half = Math.floor(bytes.length / 2);
    await handle.write(bytes, 0, half);
    await onStep?.('temp-partly-written', tempPath);
    await handle.write(bytes, half, bytes.length - half);
    await handle.sync();
    await onStep?.('temp-synced', tempPath);
  } finally {
    await handle.close();
  }
  await renameWithRetry(tempPath, filePath);
  await onStep?.('renamed', tempPath);
  await syncDirectory(dir);
}

export function isTempFileName(name: string): boolean {
  return name.includes(TEMP_MARKER);
}

/** Clears temp files left by a crash. Only names this module generated are touched. */
export async function removeTempFiles(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const removed = names.filter(isTempFileName);
  await Promise.all(removed.map((name) => fs.rm(path.join(dir, name), { force: true })));
  return removed;
}
