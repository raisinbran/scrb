import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveAmiResearchToolPaths,
  verifyAmiResearchToolPaths,
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
  return { root, assetRoot, toolRoot, ...resolved };
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

  it('rejects unsupported host platforms', () => {
    expect(() => resolveAmiResearchToolPaths({ platform: 'linux', assetRoot: '/tmp', toolRoot: '/tmp' })).toThrow(/macOS or Windows/);
  });
});
