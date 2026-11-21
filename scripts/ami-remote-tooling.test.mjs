import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveAmiResearchToolPaths,
  verifyAmiResearchToolPaths,
  withVerifiedAmiResearchRuntime,
} from './research/ami_remote_tooling.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(platform) {
  const root = mkdtempSync(join(tmpdir(), 'scrb-ami-tool-path-'));
  roots.push(root);
  const assetRoot = join(root, 'assets');
  const toolRoot = join(root, 'runtime', 'bin');
  const whisperBin = join(assetRoot, 'upstream', 'whisper.cpp', 'build', 'bin');
  mkdirSync(whisperBin, { recursive: true });
  mkdirSync(toolRoot, { recursive: true });
  const resolved = resolveAmiResearchToolPaths({ platform, assetRoot, toolRoot });
  for (const file of Object.values(resolved.toolPaths)) {
    writeFileSync(file, 'invented research executable');
  }
  return { root, assetRoot, toolRoot, platform, ...resolved };
}

describe('AMI cross-platform research executables', () => {
  it.each([
    ['darwin', 'ffmpeg', 'scrb-sherpa', 'whisper-cli'],
    ['win32', 'ffmpeg.exe', 'scrb-sherpa.exe', 'whisper-cli.exe'],
  ])('resolves expected %s executable names', async (platform, ffmpeg, sherpa, whisper) => {
    const f = fixture(platform);
    expect(f.toolPaths.ffmpeg.endsWith(ffmpeg)).toBe(true);
    expect(f.toolPaths.sherpaSidecar.endsWith(sherpa)).toBe(true);
    expect(f.toolPaths.whisperCli.endsWith(whisper)).toBe(true);
    expect(f.whisperBin).toBe(
      platform === 'darwin'
        ? f.toolRoot
        : join(f.assetRoot, 'upstream', 'whisper.cpp', 'build', 'bin'),
    );
    await expect(verifyAmiResearchToolPaths(f)).resolves.toBeUndefined();
  });

  it('rejects missing or directory-shaped tools before running inference', async () => {
    const f = fixture('darwin');
    rmSync(f.toolPaths.sherpaSidecar);
    await expect(verifyAmiResearchToolPaths(f)).rejects.toThrow(/missing research executable: sherpaSidecar/);
    mkdirSync(f.toolPaths.sherpaSidecar);
    await expect(verifyAmiResearchToolPaths(f)).rejects.toThrow(/regular file: sherpaSidecar/);
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked research executable outside the tools root', async () => {
    const f = fixture('darwin');
    const outside = join(f.root, 'outside');
    writeFileSync(outside, 'not part of verified bundle');
    rmSync(f.toolPaths.ffmpeg);
    symlinkSync(outside, f.toolPaths.ffmpeg);
    await expect(verifyAmiResearchToolPaths(f)).rejects.toThrow(/regular file: ffmpeg/);
  });


  it.skipIf(process.platform === 'win32')('rejects a Windows Whisper linked ancestor escaping public assets', async () => {
    const f = fixture('win32');
    const outside = join(f.root, 'outside-whisper', 'build', 'bin');
    mkdirSync(outside, { recursive: true });
    const linkedParent = join(f.assetRoot, 'upstream', 'whisper.cpp');
    rmSync(linkedParent, { recursive: true, force: true });
    symlinkSync(join(f.root, 'outside-whisper'), linkedParent, 'dir');
    for (const name of ['whisper-cli.exe', 'whisper-server.exe', 'whisper-vad-speech-segments.exe']) {
      writeFileSync(join(outside, name), 'untrusted Whisper executable');
    }
    await expect(verifyAmiResearchToolPaths(f)).rejects.toThrow(/escapes its assigned directory/);
  });

  it.skipIf(process.platform === 'win32')('rejects linked Mac lib directories and dylibs before invoking native launch', async () => {
    const f = fixture('darwin');
    const lib = join(f.toolRoot, 'lib');
    const launch = vi.fn();
    symlinkSync(f.root, lib, 'dir');
    await expect(withVerifiedAmiResearchRuntime(f, launch)).rejects.toThrow(/real directory/);
    expect(launch).not.toHaveBeenCalled();

    rmSync(lib);
    mkdirSync(lib);
    const outside = join(f.root, 'outside.dylib');
    writeFileSync(outside, 'untrusted dylib');
    symlinkSync(outside, join(lib, 'liboutside.dylib'));
    await expect(withVerifiedAmiResearchRuntime(f, launch)).rejects.toThrow(/regular file/);
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects an inconsistent staged Mac audit before native launch', async () => {
    const f = fixture('darwin');
    const launch = vi.fn();
    writeFileSync(join(f.toolRoot, 'DEPENDENCY-AUDIT.json'), JSON.stringify({
      schemaVersion: 1,
      stagedFiles: [{ name: 'ffmpeg', stagedSha256: '0'.repeat(64) }],
    }));
    await expect(withVerifiedAmiResearchRuntime(f, launch)).rejects.toThrow(/hash mismatch/);
    expect(launch).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'win32'])('invokes the native callback only after %s runtime preflight', async (platform) => {
    const f = fixture(platform);
    const launch = vi.fn(() => 'launched');
    await expect(withVerifiedAmiResearchRuntime(f, launch)).resolves.toBe('launched');
    expect(launch).toHaveBeenCalledOnce();
  });

  it('rejects unsupported host platforms', () => {
    expect(() => resolveAmiResearchToolPaths({ platform: 'linux', assetRoot: '/tmp', toolRoot: '/tmp' })).toThrow(/macOS or Windows/);
  });
});
