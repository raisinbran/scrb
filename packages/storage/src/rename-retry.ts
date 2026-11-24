import * as fs from 'node:fs/promises';

const BUSY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const ATTEMPTS = 6;
const DELAY_MS = 100;

/**
 * Renames a folder, retrying briefly on the codes Windows reports while a scanner or a just-closed
 * handle still holds something inside it. Other errors, and the last busy one, are thrown.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  rename: (from: string, to: string) => Promise<void> = fs.rename,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (attempt >= ATTEMPTS || typeof code !== 'string' || !BUSY_CODES.has(code)) throw error;
      await sleep(DELAY_MS * attempt);
    }
  }
}
