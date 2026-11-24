import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guardScript = path.join(root, 'scripts/test-win-installer-smoke-guards.ps1');

describe.skipIf(process.platform !== 'win32')('Windows installer smoke guard behavior', () => {
  it('executes negative identity, hash, path-containment and cleanup checks', () => {
    const result = spawnSync(
      'pwsh.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', guardScript],
      { cwd: root, encoding: 'utf8', timeout: 60_000 },
    );

    expect(result.error?.message).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Windows installer smoke guard behavior PASS');
  });
});
