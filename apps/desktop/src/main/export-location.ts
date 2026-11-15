import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** The folder of the last Scribe export, or null when none is remembered or it is gone. */
export async function readExportFolder(file: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { folder?: unknown };
    const folder = parsed.folder;
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) return null;
    return (await stat(folder)).isDirectory() ? folder : null;
  } catch {
    return null;
  }
}

/** Losing the remembered folder only costs the default start folder next time. */
export async function saveExportFolder(file: string, folder: string): Promise<void> {
  try {
    await writeFile(file, JSON.stringify({ folder }));
  } catch {
    // Ignored on purpose.
  }
}
