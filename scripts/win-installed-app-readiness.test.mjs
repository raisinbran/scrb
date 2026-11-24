import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

describe('installed Scribe.exe startup and exit acceptance wiring', () => {
  it('runs after independent installer integrity and Start Menu target checks', () => {
    const smoke = read('scripts/test-win-installer-smoke.ps1');
    const launch = smoke.indexOf('Invoke-ScribeInstalledAppReadiness');
    expect(launch).toBeGreaterThan(smoke.indexOf("Invoke-TrustedCandidateInstall -Verification $trust -Launch"));
    expect(launch).toBeGreaterThan(smoke.indexOf("$stepStatuses.startMenuShortcut = 'PASS'"));
    expect(launch).toBeLessThan(smoke.indexOf("Invoke-BoundedProcess $uninstallExe @('/S')"));
    expect(smoke).toContain("applicationLaunchReady = 'NOT VERIFIED'");
    expect(smoke).toContain("$stepStatuses.applicationLaunchReady = 'PASS'");
    expect(smoke).toContain("$isCurrentCandidate");
  });

  it('propagates readiness and copies the isolated module into the disposable user', () => {
    const parent = read('scripts/run-win-installer-smoke-real-standard-user.ps1');
    const child = read('scripts/run-win-installer-smoke-user-entry.ps1');
    expect(parent).toContain('win-installed-app-readiness.psm1');
    expect(parent).toContain("$report.steps.applicationLaunchReady -cne 'PASS'");
    expect(parent).toContain('$report.scribeLaunched -ne $true');
    expect(child).toContain("$result.steps.applicationLaunchReady -cne 'PASS'");
    expect(child).toContain('$result.scribeLaunched -ne $true');
    const module = read('scripts/win-installed-app-readiness.psm1');
    expect(module).toContain('UIAutomationClient');
    expect(module).toContain('GetOwnerSid');
    expect(module).toContain("'S-1-16-8192'");
    expect(module).toContain('CloseMainWindow()');
    expect(module).toContain('Kill($true)');
    expect(module).toContain("'Live','Recordings','Settings'");
  });

  it('requires exact parsed Windows command-line boundaries for the installed profile', () => {
    const module = read('scripts/win-installed-app-readiness.psm1');
    const regressions = read('scripts/test-win-installed-app-readiness.ps1');
    expect(module).toContain("$CommandLine.StartsWith(($program + ' '),");
    expect(module).toContain('$actualFlag = $CommandLine.Substring(');
    expect(module).toContain('$actualFlag.StartsWith($prefix, [StringComparison]::Ordinal)');
    expect(module).not.toContain('CommandLineToArgvW');
    expect(module).toContain('Test-ScribeLaunchCommandLine -CommandLine');
    expect(module).not.toContain('$normalizedCommand.IndexOf($profileArg');
    for (const scenario of [
      'sibling-prefix',
      'duplicate-flag',
      'extra-argument',
      'argument-containing-flag',
      'unbalanced-quote',
      'relative-profile',
      'wrong-executable-token',
      'wrong-flag-casing',
      'unquoted-program-spaces',
    ]) {
      expect(regressions).toContain(scenario);
    }
    expect(regressions).toContain('$script:launches -ne 0');
  });

  it.skipIf(process.platform !== 'win32')(
    'passes synthetic readiness, never-ready, identity, elevation, crash and cleanup regressions',
    () => {
      const result = spawnSync(
        'pwsh.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          path.join(root, 'scripts/test-win-installed-app-readiness.ps1'),
        ],
        // Bound a hung PowerShell subprocess independently of Vitest's per-test budget.
        { cwd: root, encoding: 'utf8', timeout: 15_000 },
      );
      expect(result.error?.message).toBeUndefined();
      expect(result.status, result.stdout + '\n' + result.stderr).toBe(0);
      expect(result.stdout).toContain('Installed Scribe GUI-ready/exit/identity/isolation/trust synthetic behavior PASS');
    },
    // This single Windows subprocess-backed fixture has taken ~7 s under shared CI load.
    // Keep its budget focused; do not raise the suite-wide timeout.
    20_000,
  );
});
