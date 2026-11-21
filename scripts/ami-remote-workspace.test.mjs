import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  assertStrictChild,
  collectAdjacentDlls,
  collectResearchRuntimeLibraries,
  createAmiWorkspace,
  readAmiSegmentAnnotations,
  requireAmiMeetingId,
} from './research/ami_remote_workspace.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'scrb-ami-path-test-'));
  roots.push(root);
  const assets = join(root, 'assets');
  const ami = join(assets, 'downloads', 'ami');
  const bin = join(root, 'tools');
  mkdirSync(ami, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(ami, 'ES2004a.Mix-Headset.wav'), 'invented audio bytes');
  return { root, assets, ami, bin };
}

describe('adjacent runtime dependency identity', () => {
  it('collects sibling DLL inputs by name', async () => {
    const f = fixture();
    writeFileSync(join(f.bin, 'onnxruntime.dll'), 'runtime dll bytes');
    writeFileSync(join(f.bin, 'ffmpeg.exe'), 'tool');
    const dlls = await collectAdjacentDlls(f.bin);
    expect(dlls['runtimeDll:onnxruntime.dll']?.endsWith(join('tools', 'onnxruntime.dll'))).toBe(
      true,
    );
  });

  it.skipIf(process.platform === 'win32')('rejects symlinked DLL inputs', async () => {
    const f = fixture();
    const outside = join(f.root, 'runtime.dll');
    writeFileSync(outside, 'external runtime');
    symlinkSync(outside, join(f.bin, 'runtime.dll'));
    await expect(collectAdjacentDlls(f.bin)).rejects.toThrow(/regular file/);
  });
});

describe('macOS research tool bundle hashing', () => {
  it('includes direct and lib/ sibling dylibs in input identity', async () => {
    const f = fixture();
    mkdirSync(join(f.bin, 'lib'));
    writeFileSync(join(f.bin, 'libdirect.dylib'), 'invented direct dylib');
    writeFileSync(join(f.bin, 'lib', 'libruntime.dylib'), 'invented staged dylib');
    const libraries = await collectResearchRuntimeLibraries(f.bin, 'darwin');
    expect(Object.keys(libraries).sort()).toEqual([
      'runtimeDylib:lib/libruntime.dylib',
      'runtimeDylib:libdirect.dylib',
    ]);
    expect(libraries['runtimeDylib:lib/libruntime.dylib']).toBe(realpathSync(join(f.bin, 'lib', 'libruntime.dylib')));
  });

  it.skipIf(process.platform === 'win32')('rejects linked dylibs and linked lib directories', async () => {
    const f = fixture();
    const outside = join(f.root, 'outside.dylib');
    writeFileSync(outside, 'private file');
    symlinkSync(outside, join(f.bin, 'linked.dylib'));
    await expect(collectResearchRuntimeLibraries(f.bin, 'darwin')).rejects.toThrow(/regular file/);
    rmSync(join(f.bin, 'linked.dylib'));
    symlinkSync(f.root, join(f.bin, 'lib'), 'dir');
    await expect(collectResearchRuntimeLibraries(f.bin, 'darwin')).rejects.toThrow(/real directory/);
  });

  it('preserves the existing Windows DLL identity behavior', async () => {
    const f = fixture();
    writeFileSync(join(f.bin, 'onnxruntime.dll'), 'invented DLL');
    expect(await collectResearchRuntimeLibraries(f.bin, 'win32')).toEqual(
      await collectAdjacentDlls(f.bin),
    );
  });
});

describe('AMI annotation containment', () => {
  it('reads regular annotations only from the canonical AMI corpus', async () => {
    const f = fixture();
    const segments = join(f.ami, 'ann', 'segments');
    mkdirSync(segments, { recursive: true });
    const xml = '<segments transcriber_start="1.0" transcriber_end="2.0" />';
    writeFileSync(join(segments, 'ES2004a.B.segments.xml'), xml);
    const rows = await readAmiSegmentAnnotations(f.ami, 'ES2004a');
    expect(rows.map((row) => row.speaker)).toEqual(['B']);
    expect(rows[0]?.xml).toBe(xml);
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked annotation directory outside AMI', async () => {
    const f = fixture();
    const outside = join(f.root, 'outside-segments');
    mkdirSync(outside);
    writeFileSync(join(outside, 'ES2004a.B.segments.xml'), '<segments />');
    mkdirSync(join(f.ami, 'ann'));
    symlinkSync(outside, join(f.ami, 'ann', 'segments'), 'dir');
    await expect(readAmiSegmentAnnotations(f.ami, 'ES2004a')).rejects.toThrow(/directory|escapes/);
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked annotation file', async () => {
    const f = fixture();
    const segments = join(f.ami, 'ann', 'segments');
    mkdirSync(segments, { recursive: true });
    const outside = join(f.root, 'outside.xml');
    writeFileSync(outside, '<segments />');
    symlinkSync(outside, join(segments, 'ES2004a.B.segments.xml'));
    await expect(readAmiSegmentAnnotations(f.ami, 'ES2004a')).rejects.toThrow(/regular file/);
  });
});

describe('AMI runner path ownership', () => {
  it.each([
    '../ES2004a',
    'ES2004a/../../other',
    'ES2004a\\outside',
    './ES2004a',
    'ES2004a..',
    'C:\\private',
    '/tmp/ES2004a',
    'ES2004A',
    '',
  ])('rejects an invalid meeting ID before any filesystem access: %s', async (meeting) => {
    expect(() => requireAmiMeetingId(meeting)).toThrow(/plain AMI ID/);
    await expect(
      createAmiWorkspace({ assets: '/missing-assets', bin: '/missing-bin', meeting }),
    ).rejects.toThrow(/plain AMI ID/);
  });

  it('rejects same-root, sibling-prefix and parent traversal paths', () => {
    const root = resolve('tmp', 'scrb-root');
    expect(() => assertStrictChild(root, root)).toThrow(/escapes/);
    expect(() => assertStrictChild(root, join(root, '..', 'scrb-root-old'))).toThrow(
      /escapes/,
    );
    expect(() => assertStrictChild(root, join(root, '..', 'outside'))).toThrow(/escapes/);
    expect(assertStrictChild(root, join(root, 'created'))).toBe(join(root, 'created'));
  });

  it('only cleans exclusive nested workspace, preserving preexisting and outside directories', async () => {
    const f = fixture();
    const sibling = join(f.root, 'survivor');
    const oldScratch = join(f.bin, 'ES2004a-final-pass-work');
    mkdirSync(sibling);
    mkdirSync(oldScratch);
    writeFileSync(join(sibling, 'sentinel'), 'important unrelated evidence');
    writeFileSync(join(oldScratch, 'sentinel'), 'old evidence');
    const workspace = await createAmiWorkspace({
      assets: f.assets,
      bin: f.bin,
      meeting: 'ES2004a',
    });
    expect(workspace.runRoot.startsWith(workspace.toolRoot + sep)).toBe(true);
    expect(workspace.workDir.startsWith(workspace.runRoot + sep)).toBe(true);
    expect(workspace.wav.startsWith(workspace.runRoot + sep)).toBe(true);
    expect(readdirSync(workspace.runRoot).length).toBe(1);
    writeFileSync(workspace.wav, 'invented clip');
    writeFileSync(join(workspace.workDir, 'scratch'), 'temporary');
    await workspace.cleanup();
    expect(existsSync(workspace.runRoot)).toBe(false);
    expect(readFileSync(join(sibling, 'sentinel'), 'utf8')).toBe('important unrelated evidence');
    expect(readFileSync(join(oldScratch, 'sentinel'), 'utf8')).toBe('old evidence');
  });

  it('uses an explicitly separate scratch root without writing into a packaged tool directory', async () => {
    const f = fixture();
    const scratch = join(f.root, 'disposable-scratch');
    mkdirSync(scratch);
    const workspace = await createAmiWorkspace({
      assets: f.assets,
      bin: f.bin,
      meeting: 'ES2004a',
      scratch,
    });
    expect(workspace.scratchRoot).toBe(realpathSync(scratch));
    expect(workspace.runRoot.startsWith(realpathSync(scratch) + sep)).toBe(true);
    expect(readdirSync(f.bin)).toEqual([]);
    await workspace.cleanup();
    expect(readdirSync(scratch)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('refuses a linked external scratch root', async () => {
    const f = fixture();
    const outside = join(f.root, 'external');
    mkdirSync(outside);
    const linked = join(f.root, 'scratch-link');
    symlinkSync(outside, linked, 'dir');
    await expect(
      createAmiWorkspace({ assets: f.assets, bin: f.bin, meeting: 'ES2004a', scratch: linked }),
    ).rejects.toThrow(/real directory/);
    expect(readdirSync(f.bin)).toEqual([]);
  });

  it('uses unique workspaces and does not remove a separate concurrent run', async () => {
    const f = fixture();
    const first = await createAmiWorkspace({ assets: f.assets, bin: f.bin, meeting: 'ES2004a' });
    const second = await createAmiWorkspace({ assets: f.assets, bin: f.bin, meeting: 'ES2004a' });
    expect(first.runRoot).not.toBe(second.runRoot);
    writeFileSync(join(second.workDir, 'sentinel'), 'still active');
    await first.cleanup();
    expect(readFileSync(join(second.workDir, 'sentinel'), 'utf8')).toBe('still active');
    await second.cleanup();
    expect(existsSync(second.runRoot)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('rejects an AMI source symlink outside the corpus', async () => {
    const f = fixture();
    const escapeFile = join(f.root, 'private.wav');
    writeFileSync(escapeFile, 'invented private file');
    const source = join(f.ami, 'ES2004a.Mix-Headset.wav');
    rmSync(source);
    symlinkSync(escapeFile, source);
    await expect(
      createAmiWorkspace({ assets: f.assets, bin: f.bin, meeting: 'ES2004a' }),
    ).rejects.toThrow(/regular file/);
    expect(readFileSync(escapeFile, 'utf8')).toBe('invented private file');
    expect(readdirSync(f.bin)).toEqual([]);
  });
});
