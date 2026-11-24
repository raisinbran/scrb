import { homedir, tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  IsolatedTestProfileError,
  openBackendAfterIsolationCheck,
  openBackendLibrary,
  resolveBackendLibraryRoot,
  type IsolatedTestProfileOptions,
} from './isolated-test-profile.ts';

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'scrb-isolated-profile-'));
  roots.push(root);
  const profile = path.join(root, 'profile');
  const library = path.join(root, 'library');
  const documents = path.join(root, 'Documents');
  mkdirSync(profile);
  mkdirSync(library);
  mkdirSync(documents);
  const options: IsolatedTestProfileOptions = {
    userDataPath: profile,
    tempPath: tmpdir(),
    documentsPath: documents,
    hasExplicitUserData: true,
  };
  const pointer = path.join(profile, 'library-location.json');
  writeFileSync(pointer, JSON.stringify({ root: library }));
  return { root, profile, library, documents, pointer, options };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('isolated synthetic test-profile startup guard', () => {
  it('opens the backend for one explicit synthetic profile and library under OS temp', async () => {
    const { options, library } = fixture();
    const openBackend = vi.fn(async () => 'opened');

    await expect(openBackendAfterIsolationCheck(options, openBackend)).resolves.toBe('opened');
    expect(openBackend).toHaveBeenCalledExactlyOnceWith(realpathSync(library));
  });

  it.each([
    ['missing pointer', (f: ReturnType<typeof fixture>) => rmSync(f.pointer)],
    ['malformed pointer', (f: ReturnType<typeof fixture>) => writeFileSync(f.pointer, '{')],
    [
      'empty pointer root',
      (f: ReturnType<typeof fixture>) => writeFileSync(f.pointer, '{"root":""}'),
    ],
    [
      'non-string pointer root',
      (f: ReturnType<typeof fixture>) => writeFileSync(f.pointer, '{"root":4}'),
    ],
    [
      'relative library path',
      (f: ReturnType<typeof fixture>) => writeFileSync(f.pointer, '{"root":"library"}'),
    ],
    [
      'missing library directory',
      (f: ReturnType<typeof fixture>) =>
        writeFileSync(f.pointer, JSON.stringify({ root: path.join(f.root, 'missing') })),
    ],
    [
      'library outside OS temp',
      (f: ReturnType<typeof fixture>) =>
        writeFileSync(f.pointer, JSON.stringify({ root: homedir() })),
    ],
    [
      'profile outside OS temp',
      (f: ReturnType<typeof fixture>) => {
        f.options.userDataPath = homedir();
      },
    ],
    [
      'Documents fallback',
      (f: ReturnType<typeof fixture>) => {
        const fallback = path.join(f.documents, 'Meeting Scribe');
        mkdirSync(fallback);
        writeFileSync(f.pointer, JSON.stringify({ root: fallback }));
      },
    ],
    [
      'library nested in profile',
      (f: ReturnType<typeof fixture>) => {
        const nested = path.join(f.profile, 'nested-library');
        mkdirSync(nested);
        writeFileSync(f.pointer, JSON.stringify({ root: nested }));
      },
    ],
    [
      'profile nested in library',
      (f: ReturnType<typeof fixture>) => {
        writeFileSync(f.pointer, JSON.stringify({ root: f.root }));
      },
    ],
    [
      'library symlink escape',
      (f: ReturnType<typeof fixture>) => {
        const escape = path.join(f.root, 'library-escape');
        symlinkSync(homedir(), escape);
        writeFileSync(f.pointer, JSON.stringify({ root: escape }));
      },
    ],
    [
      'pointer symlink',
      (f: ReturnType<typeof fixture>) => {
        const realPointer = path.join(f.root, 'pointer.json');
        writeFileSync(realPointer, JSON.stringify({ root: f.library }));
        rmSync(f.pointer);
        symlinkSync(realPointer, f.pointer);
      },
    ],
    [
      'missing explicit user-data-dir',
      (f: ReturnType<typeof fixture>) => {
        f.options.hasExplicitUserData = false;
      },
    ],
  ])('fails closed for %s without opening the backend', async (_label, mutate) => {
    const f = fixture();
    mutate(f);
    const openBackend = vi.fn(async () => 'opened');

    await expect(openBackendAfterIsolationCheck(f.options, openBackend)).rejects.toBeInstanceOf(
      IsolatedTestProfileError,
    );
    expect(openBackend).not.toHaveBeenCalled();
  });

  it('keeps ordinary startup unchanged when the opt-in profile is absent', async () => {
    const openBackend = vi.fn(async () => 'opened');

    await expect(openBackendAfterIsolationCheck(null, openBackend)).resolves.toBe('opened');
    expect(openBackend).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('keeps backend and recovery on the validated root if the pointer disappears after preflight', async () => {
    const { options, pointer, profile, library, documents } = fixture();
    const fallback = path.join(documents, 'Meeting Scribe');
    mkdirSync(fallback);
    const canonicalLibrary = realpathSync(library);
    const openLibrary = vi.fn(async (root: string) => root);

    const paths = await openBackendAfterIsolationCheck(options, async (validatedRoot) => {
      expect(validatedRoot).toBe(canonicalLibrary);
      rmSync(pointer);
      const readLocation = vi.fn(async (_profile: string, defaultRoot: string) => defaultRoot);
      const opened = await openBackendLibrary(
        validatedRoot,
        profile,
        fallback,
        readLocation,
        openLibrary,
      );
      return {
        backendRoot: opened.root,
        openedLibraryRoot: opened.library,
        recoveryFolder: await resolveBackendLibraryRoot(
          validatedRoot,
          profile,
          fallback,
          readLocation,
        ),
      };
    });

    expect(paths).toEqual({
      backendRoot: canonicalLibrary,
      openedLibraryRoot: canonicalLibrary,
      recoveryFolder: canonicalLibrary,
    });
    expect(openLibrary).toHaveBeenCalledExactlyOnceWith(canonicalLibrary);
    await expect(
      resolveBackendLibraryRoot(
        null,
        profile,
        fallback,
        async (_profile, defaultRoot) => defaultRoot,
      ),
    ).resolves.toBe(fallback);
  });

  it('wires the opt-in guard around the real backend startup', () => {
    const source = readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
    const backendSource = readFileSync(path.join(__dirname, 'backend.ts'), 'utf8');

    expect(source).toContain("app.commandLine.hasSwitch('scrb-isolated-test-profile')");
    // Assert the validated callback root reaches openBackend, regardless of formatting.
    expect(source).toMatch(
      /openBackendAfterIsolationCheck\(\s*isolatedTestProfile,\s*\(([A-Za-z_$][\w$]*)\)\s*=>\s*openBackend\([\s\S]*?\b\1\s*\?\?\s*undefined\s*,/,
    );
    expect(source).toContain('app.exit(1);');
    expect(source).toContain('isolatedLibraryRoot ?? undefined');
    expect(backendSource).toContain(
      'openBackendLibrary(\n      isolatedLibraryRoot,\n      userData,\n      fallback,',
    );
    expect(backendSource).toContain('(root) => Library.open({ root })');
    expect(backendSource).toMatch(
      /folder:\s*await resolveBackendLibraryRoot\(\s*isolatedLibraryRoot,\s*app\.getPath\('userData'\),\s*fallback,/,
    );
  });
});
