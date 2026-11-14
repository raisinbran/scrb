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
});
