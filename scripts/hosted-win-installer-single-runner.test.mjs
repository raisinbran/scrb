import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const yaml = read('.github/workflows/windows-installer-single-runner-smoke.yml');
const script = read('scripts/run-win-installer-single-runner.ps1');

describe('manual-only Windows NSIS source built and installed on one disposable runner', () => {
  it('has two false opt-ins, expected main SHA, owner actor/ref/attempt and one job', () => {
    expect(yaml).toMatch(/^on:\s*\n  workflow_dispatch:/m);
    expect(yaml).not.toMatch(/^\s*pull_request:|^\s*workflow_run:|^\s*workflow_call:/m);
    expect((yaml.match(/default: false/g) ?? []).length).toBe(2);
    expect(yaml).toContain('expected_source_sha:');
    expect(yaml).toContain('github.sha == inputs.expected_source_sha');
    expect(yaml).toContain("github.actor == 'raisinbran'");
    expect(yaml).toContain("github.triggering_actor == 'raisinbran'");
    expect(yaml).toContain("github.ref == 'refs/heads/main'");
    expect(yaml).toContain("github.run_attempt == 1");
    expect(yaml).toContain("github.workflow_ref == 'raisinbran/scrb/.github/workflows/windows-installer-single-runner-smoke.yml@refs/heads/main'");
    expect(yaml).toContain('timeout-minutes: 130');
    expect(yaml.match(/^  [a-z][a-z0-9-]+:\s*$/gm)).toEqual(['  verified-installer-producer:']);
    expect(yaml).toContain('persist-credentials: false');
    expect(yaml).toContain('node-version-file: .nvmrc');
  });

  it('never uploads, downloads from Actions artifacts, caches or publishes candidate binaries', () => {
    expect(yaml).not.toMatch(/actions\/(?:upload-artifact|download-artifact|cache)@|^\s*cache:|^\s*artifacts:/mi);
    expect(yaml).not.toMatch(/upload-release-asset|publish\s+always/i);
    expect(yaml).toContain('scripts/build-win-hosted-tools.ps1');
    expect(yaml).toContain('scripts/package-win.ps1 -Slice 3');
    expect(yaml).toContain('scripts/package-win-installer.ps1');
    expect(yaml).toContain('scripts/run-win-installer-smoke-standard-user.ps1');
    expect(yaml).toContain('scripts/run-win-installer-single-runner.ps1 -Mode Consume');
    expect(yaml).toContain('if: always()');
    expect(yaml).toContain('scripts/run-win-installer-single-runner.ps1 -Mode Cleanup');
    expect(script).toContain('Assert-TrustedCandidate');
    expect(script).toContain('applicationLaunchReady');
    expect(script).toContain('BLOCKED: reviewed and merged #424 GUI readiness dependency unavailable');
  });

  it('uses six same-job metadata checks but never claims independent cross-job attestation', () => {
    for (const field of [
      'manifest_sha256', 'source_commit', 'provenance_sha256',
      'dependency_audit_sha256', 'producer_run_id', 'producer_run_attempt',
    ]) {
      expect(yaml).toContain('steps.package.outputs.' + field);
    }
    expect(yaml).not.toContain('needs.verified-installer-producer');
    expect(yaml).toContain('Cross-job independent attestations: NOT AVAILABLE');
    const packager = read('scripts/package-win-installer.ps1');
    expect(packager).toContain('[string]$OutputRoot');
    expect(packager).toContain('direct child of RUNNER_TEMP');
    expect(packager).toContain('--publish never');
    expect(packager).toContain("if ($env:GITHUB_JOB -cne");
    expect(packager).toContain('manifest_sha256=$manifestSha');
  });

  it.skipIf(process.platform !== 'win32')(
    'rejects a PR CI dispatch before touching source or starting a genuine build',
    () => {
      const result = spawnSync('pwsh.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive',
        '-File', path.join(root, 'scripts/run-win-installer-single-runner.ps1'),
        '-Mode', 'Preflight', '-ExpectedSourceSha', 'a'.repeat(40),
      ], { cwd: root, encoding: 'utf8', timeout: 15_000, env: {
        ...process.env, GITHUB_ACTIONS: 'false', SCRIBE_GENUINE_BUILD_OPT_IN: 'false',
      } });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/REFUSED: invalid actor, trigger, workflow, source, attempt or owner opt-in/);
    },
  );

  it.skipIf(process.platform !== 'win32')(
    'parses PowerShell and runs invented candidate/dispatch/hash/no-launch refusal tests',
    () => {
      for (const file of [
        'scripts/run-win-installer-single-runner.ps1',
        'scripts/package-win-installer.ps1',
        'scripts/test-win-installer-single-runner.ps1',
      ]) {
        const filename = path.join(root, file).replaceAll("'", "''");
        const expr = '$tokens=$null; $errors=$null;' +
          "[void][Management.Automation.Language.Parser]::ParseFile('" + filename +
          "',[ref]$tokens,[ref]$errors);" +
          'if($errors.Count){$errors|Out-String|Write-Error;exit 1}';
        const parsed = spawnSync('pwsh.exe', [
          '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', expr,
        ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
        expect(parsed.status, file + '\n' + parsed.stdout + '\n' + parsed.stderr).toBe(0);
      }
      const test = spawnSync('pwsh.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-File',
        path.join(root, 'scripts/test-win-installer-single-runner.ps1'),
      ], { cwd: root, encoding: 'utf8', timeout: 60_000 });
      expect(test.status, test.stdout + '\n' + test.stderr).toBe(0);
      expect(test.stdout).toContain('Single-runner invented dispatch, exact five-file, hash and zero-launch refusals PASS');
    },
  );
});
