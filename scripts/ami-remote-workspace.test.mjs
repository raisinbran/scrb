import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  assertStrictChild,
  createAmiWorkspace,
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
    expect(workspace.runRoot.startsWith(f.bin + sep)).toBe(true);
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
