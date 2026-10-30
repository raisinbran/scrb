import * as fs from 'node:fs/promises';
import { atomicWriteFile, type AtomicWriteOptions } from '../atomic.ts';
import { CorruptFileError, UnsupportedVersionError } from '../errors.ts';

export type JsonObject = Record<string, unknown>;

/**
 * One versioned file format. `upgrades[n]` turns version n into n+1, so a file of any older
 * version climbs the whole ladder and every step stays tested.
 */
export interface FileFormat<T> {
  name: string;
  version: number;
  upgrades: Record<number, (doc: JsonObject) => JsonObject>;
  /** Throws a plain Error describing the first problem. */
  validate: (doc: JsonObject) => T;
}

export function assertFormat(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}

export function upgradeDocument<T>(format: FileFormat<T>, raw: JsonObject): T {
  let version = raw['schemaVersion'];
  assertFormat(Number.isInteger(version) && (version as number) >= 1, 'missing schemaVersion');
  if ((version as number) > format.version) {
    throw new UnsupportedVersionError(format.name, version as number, format.version);
  }
  let doc = raw;
  while ((version as number) < format.version) {
    const step = format.upgrades[version as number];
    assertFormat(step, `no upgrade from version ${String(version)}`);
    doc = step(doc);
    version = (version as number) + 1;
    doc = { ...doc, schemaVersion: version };
  }
  return format.validate(doc);
}

export interface LoadedDocument<T> {
  doc: T;
  /** The version on disk, before any upgrade. */
  fileVersion: number;
}

/** Returns null when the file does not exist. Upgrades in memory; the file changes on next save. */
export async function loadDocument<T>(
  format: FileFormat<T>,
  filePath: string,
): Promise<LoadedDocument<T> | null> {
  let text: string;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const raw = JSON.parse(text) as unknown;
    assertFormat(typeof raw === 'object' && raw !== null && !Array.isArray(raw), 'not an object');
    const fileVersion = (raw as JsonObject)['schemaVersion'] as number;
    return { doc: upgradeDocument(format, raw as JsonObject), fileVersion };
  } catch (error) {
    if (error instanceof UnsupportedVersionError) throw error;
    throw new CorruptFileError(filePath, (error as Error).message);
  }
}

/**
 * Saves atomically. If this save would replace an older format, the old file is kept once as
 * `<name>.v<version>.bak` so a faulty upgrade cannot destroy the only copy of a meeting.
 */
export async function saveDocument<T extends { schemaVersion: number }>(
  filePath: string,
  doc: T,
  previousFileVersion: number | null,
  options: AtomicWriteOptions = {},
): Promise<void> {
  if (previousFileVersion !== null && previousFileVersion < doc.schemaVersion) {
    await fs
      .copyFile(filePath, `${filePath}.v${previousFileVersion}.bak`, fs.constants.COPYFILE_EXCL)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
  }
  await atomicWriteFile(filePath, JSON.stringify(doc), options);
}
