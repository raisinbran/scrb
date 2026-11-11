import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { libraryPaths } from './layout.ts';
import { Library, type LibraryOptions } from './library.ts';

let template: Promise<string> | undefined;

/** An index that one fresh open per test file migrated, for every test in that file to copy. */
function migratedIndex(): Promise<string> {
  template ??= (async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-test-index-'));
    await (await Library.open({ root })).close();
    return libraryPaths(root).index;
  })();
  return template;
}

/**
 * Opens a library in a new folder from a copy of a migrated index, for tests only. A new index
 * runs every migration step, each in its own transaction with several disk flushes. That is slow
 * on Windows CI runners. The copy fails if the folder already has an index.
 */
export async function openTestLibrary(options: LibraryOptions): Promise<Library> {
  await mkdir(options.root, { recursive: true });
  const index = libraryPaths(options.root).index;
  await copyFile(await migratedIndex(), index, constants.COPYFILE_EXCL);
  return Library.open(options);
}
