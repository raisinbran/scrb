import { readFile } from 'node:fs/promises';
import type { LicenseEntry } from '@scrb/contracts';

/** Reads the list that `scripts/generate-licenses.mjs` writes next to the main bundle at build time. */
export function createLicensesHandler(file: string): () => Promise<LicenseEntry[]> {
  return async () => {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every(
        (e) =>
          e &&
          ['name', 'version', 'license', 'text'].every(
            (k) => typeof e[k] === 'string' && e[k].length > 0,
          ),
      )
    ) {
      throw new Error('licenses.json is empty or malformed; rebuild the app.');
    }
    return parsed as LicenseEntry[];
  };
}
