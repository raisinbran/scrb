import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readLibraryLocation } from '@scrb/storage';

export interface IsolatedTestProfileOptions {
  /** Electron's effective userData path, after --user-data-dir has been applied. */
  userDataPath: string;
  /** Electron's OS temporary directory. */
  tempPath: string;
  /** Electron's Documents directory, used to reject the product fallback explicitly. */
  documentsPath: string;
  /** Whether the caller supplied --user-data-dir. */
  hasExplicitUserData: boolean;
}

export class IsolatedTestProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsolatedTestProfileError';
  }
}

function fail(message: string): never {
  throw new IsolatedTestProfileError(message);
}

function canonicalDirectory(candidate: string, label: string): string {
  let stat;
  try {
    stat = lstatSync(candidate);
  } catch {
    return fail(`${label} directory is missing or unavailable.`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return fail(`${label} must be an existing, non-symlink directory.`);
  }
  try {
    return realpathSync(candidate);
  } catch {
    return fail(`${label} directory cannot be resolved.`);
  }
}

/** Resolve a path even when its leaf has not been created, following existing parent links. */
function canonicalPath(candidate: string): string {
  let current = path.resolve(candidate);
  const suffix: string[] = [];
  while (true) {
    try {
      lstatSync(current);
      return path.resolve(realpathSync(current), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function pathsOverlap(first: string, second: string): boolean {
  return first === second || isWithin(first, second) || isWithin(second, first);
}

/**
 * Validate the explicit synthetic test profile before backend startup. This is opt-in only;
 * normal user startup retains the existing storage-location behavior.
 */
export function validateIsolatedTestProfile(options: IsolatedTestProfileOptions): string {
  if (!options.hasExplicitUserData) fail('An isolated test profile requires --user-data-dir.');

  const temp = canonicalDirectory(options.tempPath, 'Temporary root');
  const profile = canonicalDirectory(options.userDataPath, 'Test profile');
  if (!isWithin(temp, profile)) fail('Test profile must be inside the OS temporary directory.');

  const pointerPath = path.join(profile, 'library-location.json');
  let pointerInfo;
  try {
    pointerInfo = lstatSync(pointerPath);
  } catch {
    return fail('Test profile has no readable library-location.json.');
  }
  if (!pointerInfo.isFile() || pointerInfo.isSymbolicLink()) {
    fail('Test library pointer must be a regular, non-symlink file.');
  }

  let root: unknown;
  try {
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { root?: unknown };
    root = pointer.root;
  } catch {
    return fail('Test library pointer is unreadable or malformed.');
  }
  if (typeof root !== 'string' || root.trim() === '' || !path.isAbsolute(root)) {
    fail('Test library pointer must contain an absolute root path.');
  }

  const library = canonicalDirectory(root, 'Test library');
  if (!isWithin(temp, library)) fail('Test library must be inside the OS temporary directory.');
  if (pathsOverlap(profile, library))
    fail('Test profile and library must be separate directories.');

  let fallback: string;
  try {
    fallback = canonicalPath(path.join(options.documentsPath, 'Meeting Scribe'));
  } catch {
    return fail('The default Documents library location cannot be safely resolved.');
  }
  if (pathsOverlap(fallback, library))
    fail('Test library cannot be the default Documents library.');
  return library;
}

/** Call the backend only after an explicitly requested synthetic profile passes validation. */
export async function openBackendAfterIsolationCheck<T>(
  options: IsolatedTestProfileOptions | null,
  openBackend: (validatedLibraryRoot: string | null) => Promise<T>,
): Promise<T> {
  const validatedLibraryRoot = options ? validateIsolatedTestProfile(options) : null;
  return openBackend(validatedLibraryRoot);
}

/** Use a validated root directly in opt-in mode; only ordinary startup may consult the pointer. */
export async function resolveBackendLibraryRoot(
  validatedLibraryRoot: string | null | undefined,
  userDataPath: string,
  fallbackPath: string,
): Promise<string> {
  if (validatedLibraryRoot !== null && validatedLibraryRoot !== undefined)
    return validatedLibraryRoot;
  return readLibraryLocation(userDataPath, fallbackPath);
}

/** Select the root first, then open exactly that root; useful for deterministic boundary tests. */
export async function openBackendLibrary<T>(
  validatedLibraryRoot: string | null | undefined,
  userDataPath: string,
  fallbackPath: string,
  openLibrary: (root: string) => Promise<T>,
): Promise<{ root: string; library: T }> {
  const root = await resolveBackendLibraryRoot(validatedLibraryRoot, userDataPath, fallbackPath);
  return { root, library: await openLibrary(root) };
}
