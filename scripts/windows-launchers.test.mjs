import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const launchers = [
  'scripts/m1.cmd',
  'scripts/m1.test.cmd',
  'scripts/package-win.cmd',
  'native/windows-capture/scripts/fetch-opus.cmd',
];
const root = join(import.meta.dirname, '..');

describe('Windows .cmd launchers', () => {
  it.each(launchers)(
    '%s runs its sibling script with the policy bypass, arguments and exit code',
    (file) => {
      const text = readFileSync(join(root, file), 'utf8');
      const m =
        /^powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0([^"]+\.ps1)" %\*\r?$/m.exec(
          text,
        );
      expect(m, 'launcher line').not.toBeNull();
      expect(existsSync(join(root, dirname(file), m[1]))).toBe(true);
      expect(text).toMatch(/^exit \/b %ERRORLEVEL%\r?$/m);
    },
  );

  it('keeps slice 1 optional and verifies packaged resources for slices 2 and 3', () => {
    const script = readFileSync(join(root, 'scripts/package-win.ps1'), 'utf8');
    expect(script).toContain("[ValidateSet('1', '2', '3')]");
    expect(script).toContain("if ($Slice -eq '1')");
    expect(script).toContain(
      'elseif (-not (Test-Path -LiteralPath $stageBin -PathType Container))',
    );
    expect(script).toContain("if ($Slice -in @('2', '3'))");
    expect(script).toContain('scripts\\verify-win-package.mjs');
    expect(script).toContain('--packaged $packagedBin --slice $Slice');
  });
});
