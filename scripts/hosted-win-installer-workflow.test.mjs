import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const workflow = read('.github/workflows/windows-installer-smoke.yml');

describe('trusted hosted public-source Windows installer pipeline', () => {
  it('never runs genuine install on automatic pull-request events', () => {
    expect(workflow).toContain("if: github.event_name == 'pull_request'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain('inputs.genuine_source_build_and_install == true');
    expect(workflow).toContain("github.actor == 'raisinbran'");
    expect(workflow).toContain('timeout-minutes: 105');
    expect(workflow).toContain('scripts/build-win-hosted-tools.ps1');
    expect(workflow).toContain('scripts/package-win.ps1 -Slice 3');
    expect(workflow).toContain('scripts/package-win-installer.ps1');
  });

  it('binds an isolated consumer to independent job outputs, not artifact JSON', () => {
    expect(workflow).toContain('needs: verified-installer-producer');
    for (const value of [
      'manifest_sha256','source_commit','provenance_sha256',
      'dependency_audit_sha256','producer_run_id','producer_run_attempt',
    ]) {
      expect(workflow).toContain('steps.package.outputs.' + value);
      expect(workflow).toContain('needs.verified-installer-producer.outputs.' + value);
    }
    expect(workflow).toContain('run-win-installer-smoke-real-standard-user.ps1 @trusted');
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain('retention-days: 1');
    expect(workflow).toContain('scribe-encrypted-smoke-');
    expect(workflow).not.toContain('scribe-public-source-smoke-');
    expect(workflow).not.toContain('permit_public_unsigned_test_artifact');
    expect(workflow).toContain('scripts/prepare-win-installer-encrypted-transfer.ps1');
    expect(workflow).toContain('scripts/receive-win-installer-encrypted-transfer.ps1');
    expect(workflow).toContain('scribe-installer-candidate.age');
    expect(workflow).toContain('environment: windows-installer-test-decrypt');
    expect(workflow).toContain('secrets.WIN_INSTALLER_SMOKE_AGE_IDENTITY');
    expect(workflow).toContain('github.triggering_actor');
    expect(workflow).toContain('github.workflow_ref');
    expect(workflow).toContain('github.run_attempt == 1');
    expect(workflow).toContain('inputs.encrypted_installer_transfer == true');
    expect(workflow).not.toContain('path: ${{ runner.temp }}/scribe-installer-artifact/*');
    const source = read('scripts/run-win-installer-smoke-user-entry.ps1');
    expect(source).toContain('Assert-SmokeIdentity');
    expect(source).toContain('test-win-installer-smoke.ps1');
    const smoke = read('scripts/test-win-installer-smoke.ps1');
    expect(smoke).toContain('Invoke-TrustedCandidateInstall -Verification $trust -Launch');
  });

  it('requires pinned source archives and verified seven-tool stage before NSIS', () => {
    const builder = read('scripts/build-win-hosted-tools.ps1');
    const stage = read('scripts/stage-win-tools.mjs');
    expect(builder).toContain("Invoke-Download 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/");
    expect(builder).toContain('Pinned public source SHA-256 mismatch');
    expect(builder).toContain('Get-AuthenticodeSignature');
    expect(builder).toContain('stage-win-tools.mjs');
    expect(builder).toContain("'--capture-bin', $captureBin");
    expect(stage).toContain("process.env.GITHUB_JOB !== 'verified-installer-producer'");
    expect(stage).toContain("hosted.ffmpegArchiveSha256 !== PUBLIC_FFMPEG_ARCHIVE_SHA256");
    expect(stage).toContain("hosted ? hosted.runtimeHashes : PINNED_MSVC_RUNTIME_HASHES");
    expect(stage).toContain('verifyTools: (directory, system32) => verifyStagedTools(directory, system32)');
    const packager = read('scripts/package-win-installer.ps1');
    expect(packager).toContain("if ($env:GITHUB_JOB -cne 'verified-installer-producer'");
    expect(packager).toContain('"manifest_sha256=$manifestSha"');
  });

  it('requires a fail-closed pinned public recipient and prevents plaintext uploads', () => {
    expect(read('.github/windows-installer-age-recipient.txt').trim()).toBe('UNCONFIGURED');
    const transfer = read('scripts/win-installer-encrypted-transfer.psm1');
    expect(transfer).toContain('f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7');
    expect(transfer).toContain('Assert-EncryptedInstallerDispatch');
    expect(transfer).toContain('Expand-StrictInstallerArchive');
    expect(read('scripts/receive-win-installer-encrypted-transfer.ps1')).toContain('Assert-TrustedCandidate');
    expect(workflow).not.toContain('scribe-public-source-smoke-');
  });

  it.skipIf(process.platform !== 'win32')(
    'parses the hosted builder and both standard-user scripts with PowerShell',
    () => {
      const paths = [
        'scripts/build-win-hosted-tools.ps1',
        'scripts/run-win-installer-smoke-user-entry.ps1',
        'scripts/run-win-installer-smoke-real-standard-user.ps1',
        'scripts/win-installer-encrypted-transfer.psm1',
        'scripts/prepare-win-installer-encrypted-transfer.ps1',
        'scripts/receive-win-installer-encrypted-transfer.ps1',
        'scripts/test-win-installer-encrypted-transfer.ps1',
      ];
      for (const relative of paths) {
        const filename = path.join(root, relative).replaceAll("'", "''");
        const expr =
          '$tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile(' +
          "'" + filename + "',[ref]$tokens,[ref]$errors); if($errors.Count){$errors | Out-String | Write-Error; exit 1}";
        const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', expr], {
          cwd: root, encoding: 'utf8', timeout: 30_000,
        });
        expect(result.error?.message).toBeUndefined();
        expect(result.status, relative + '\n' + result.stdout + '\n' + result.stderr).toBe(0);
      }
    },
  );

  it.skipIf(process.platform !== 'win32')(
    'runs encrypted-transfer synthetic refusal and round-trip checks', () => {
      const test = path.join(root, 'scripts/test-win-installer-encrypted-transfer.ps1');
      const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', test], {
        cwd: root, encoding: 'utf8', timeout: 120_000,
      });
      expect(result.error?.message).toBeUndefined();
      expect(result.status, result.stdout + '\\n' + result.stderr).toBe(0);
      expect(result.stdout).toContain('Encrypted transfer synthetic protections PASS');
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'refuses hosted-source staging from an ordinary PR CI job before touching source inputs',
    () => {
      const result = spawnSync('node', [
        path.join(root, 'scripts/stage-win-tools.mjs'),
        '--out', path.join(root, 'nonexistent-fixture-stage'),
        '--hosted-source-evidence', path.join(root, 'nonexistent-public-source-evidence.json'),
      ], { cwd: root, encoding: 'utf8', timeout: 15_000 });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Hosted-source staging requires an exact trusted producer dispatch/);
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'refuses actual hosted source-building and installer launch from pull-request CI before side effects',
    () => {
      const expected = [
        ['scripts/build-win-hosted-tools.ps1', [
          '-StagingDirectory', path.join(root, 'nonexistent-stage'),
          '-SourceEvidenceFile', path.join(root, 'nonexistent-evidence.json'),
        ], /exact trusted hosted producer dispatch/],
        ['scripts/run-win-installer-smoke-real-standard-user.ps1', [
          '-RunnerTemp', process.env.RUNNER_TEMP ?? 'C:\\nonexistent-runner-temp',
          '-TrustedManifestSha256', 'a'.repeat(64),
          '-TrustedSourceCommit', 'b'.repeat(40),
          '-TrustedProvenanceSha256', 'c'.repeat(64),
          '-TrustedDependencyAuditSha256', 'd'.repeat(64),
          '-TrustedProducerRunId', '42',
          '-TrustedProducerRunAttempt', '1',
        ], /restricted to an explicit hosted dispatch/],
      ];
      for (const [file, args, rejection] of expected) {
        const result = spawnSync('pwsh.exe', [
          '-NoLogo', '-NoProfile', '-NonInteractive',
          '-File', path.join(root, file), ...args,
        ], { cwd: root, encoding: 'utf8', timeout: 30_000 });
        expect(result.error?.message).toBeUndefined();
        expect(result.status).not.toBe(0);
        expect(result.stderr, file).toMatch(rejection);
      }
    },
  );

});
