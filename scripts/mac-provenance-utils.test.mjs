import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceChanges, summarizeProbe } from './mac-provenance-utils.mjs';

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scrb-mac-provenance-'));
  temporary.push(root);
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Fixture']);
  mkdirSync(path.join(root, 'scripts'));
  writeFileSync(path.join(root, 'scripts', 'tracked.mjs'), 'const before = true;\n');
  execFileSync('git', ['-C', root, 'add', 'scripts/tracked.mjs']);
  execFileSync('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return root;
}

describe('Mac packaging provenance helpers', () => {
  it('returns clean relative tracked paths without porcelain-column slicing', () => {
    const root = repository();
    writeFileSync(path.join(root, 'scripts', 'tracked.mjs'), 'const after = true;\n');
    expect(collectSourceChanges(root).changedTrackedFiles).toEqual(['scripts/tracked.mjs']);
  });

  it('includes untracked source files in the patch digest and names them', () => {
    const root = repository();
    const initial = collectSourceChanges(root).workingTreePatchSha256;
    writeFileSync(path.join(root, 'scripts', 'new-provenance.mjs'), 'export const revision = 1;\n');
    const changed = collectSourceChanges(root);
    expect(changed.untrackedSourceFiles).toEqual(['scripts/new-provenance.mjs']);
    expect(changed.workingTreePatchSha256).not.toBe(initial);
  });

  it('records a probe digest and status without retaining raw output', () => {
    const summary = summarizeProbe({
      args: ['-buildconf'],
      status: 0,
      output: 'configuration from synthetic build root\n--disable-network',
      matchedExpectedOutput: true,
    });
    expect(summary).toEqual({
      args: ['-buildconf'],
      status: 0,
      outputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      matchedExpectedOutput: true,
    });
    expect(JSON.stringify(summary)).not.toContain('configuration from synthetic build root');
  });

  it('pins upstream source and uses tools from the checkout being packaged', () => {
    const script = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'package-mac.sh'),
      'utf8',
    );
    expect(script).toContain('assert_asset_commit "${assets}/upstream/whisper.cpp"');
    expect(script).toContain('capture="$repo/native/macos-capture/build/scrb-capture"');
    expect(script).toContain('tools="$repo/packages/transcription/.bin"');
    expect(script).not.toContain('Tool sources. A worktree has no build folders');
  });
});
