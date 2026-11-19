import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readFileSync(path.join(root, 'apps/desktop/electron-builder.yml'), 'utf8');
const script = readFileSync(path.join(root, 'scripts/package-win-installer.ps1'), 'utf8');

describe('per-user Windows installer configuration', () => {
  it('adds only the x64 NSIS target and keeps Windows resources mapped to resources/bin', () => {
    expect(config).toMatch(
      /win:\r?\n  icon: assets\/icons\/icon\.ico\r?\n  target:\r?\n    - target: dir\r?\n      arch: x64\r?\n    - target: nsis\r?\n      arch: x64\r?\n  extraResources:\r?\n    - from: build\/win-stage\/bin\r?\n      to: bin/,
    );
  });

  it('leaves Mac packaging on its existing resource path and target', () => {
    expect(config).toMatch(
      /mac:[\s\S]*?extraResources:\r?\n    - from: build\/mac-stage\/bin\r?\n      to: bin[\s\S]*?target:\r?\n    - target: dir\r?\n      arch: arm64/,
    );
  });

  it('forces a per-user one-click install and preserves user data on uninstall', () => {
    expect(config).toMatch(
      /nsis:\r?\n  oneClick: true\r?\n  perMachine: false\r?\n  allowElevation: false\r?\n  deleteAppDataOnUninstall: false\r?\n  createStartMenuShortcut: true\r?\n  createDesktopShortcut: false\r?\n  runAfterFinish: false/,
    );
  });

  it('verifies the seven-tool input before packaging and never launches the installer', () => {
    expect(script).toContain('verify-win-package.mjs');
    expect(script).toContain('--slice 3');
    expect(script).toContain('--prepackaged $prepackaged');
    expect(script).toContain('--publish never');
    expect(script).toContain('Get-FileHash -LiteralPath $installer -Algorithm SHA256');
    expect(script).not.toMatch(/Start-Process|Invoke-Expression|Remove-Item/);
  });
});
