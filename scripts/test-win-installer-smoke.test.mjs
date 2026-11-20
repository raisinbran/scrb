import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smoke = readFileSync(path.join(root, 'scripts/test-win-installer-smoke.ps1'), 'utf8');
const workflow = readFileSync(
  path.join(root, '.github/workflows/windows-installer-smoke.yml'),
  'utf8',
);

describe('Windows installer smoke safety contract', () => {
  it('only runs on an ephemeral GitHub-hosted, non-elevated runner', () => {
    expect(smoke).toContain("$env:RUNNER_ENVIRONMENT -ne 'github-hosted'");
    expect(smoke).toContain('$identity.IsSystem');
    expect(smoke).toContain("$identity.Name -match 'CodexSandboxOffline'");
    expect(smoke).toContain('WindowsBuiltInRole]::Administrator');
  });

  it('pins the exact candidate payload and refuses path escapes', () => {
    expect(smoke).toContain('131037432');
    expect(smoke).toContain('ec5c1ecd5207d44049d7b7dc065b2da7deb607497f04b7ca12488e78e37718d6');
    expect(smoke).toContain('31817c8b75c860fa36ddd0055677d5cbd374f4a564fa02097ccc77449993ae31');
    expect(smoke).toContain("'scribe-installer-artifact'");
    expect(smoke).toContain('Assert-Within');
  });

  it('checks per-user install, shortcut, uninstall and synthetic user-data preservation', () => {
    expect(smoke).toContain("Invoke-BoundedProcess $installer @('/S'");
    expect(smoke).toContain("Invoke-BoundedProcess $uninstallExe @('/S')");
    expect(smoke).toContain("'Scribe.lnk'");
    expect(smoke).toContain('syntheticUserDataPreserved');
    expect(smoke).toContain('applicationExecutableIntegrity');
    expect(smoke).toContain("status = 'OWNER VERIFIED; NOT RETESTED'");
    expect(smoke).toContain('30f854def12121d612a4089c4a0b009c03983d3e22c100251f8d8a3e47d282b6');
    expect(smoke).toContain('canExecuteAutonomously');
    expect(smoke).toContain('isolatedInstallUninstall');
    expect(smoke).toContain("twoTrackRealCapture = 'NOT TESTED'");
    expect(smoke).toContain("finalTranscriptSeekCopy = 'NOT TESTED'");
    expect(smoke).toContain('blocker = $failure');
    expect(smoke).toContain('TimeBudgetMinutes = 15');
    expect(smoke).toContain('recordingTested = $false');
    expect(smoke).toContain('securityPolicyChanged = $false');
  });

  it('uses a cross-run GitHub artifact and a bounded Windows-hosted job', () => {
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('timeout-minutes: 20');
    expect(workflow).toContain('name: scribe-windows-installer');
    expect(workflow).toContain('run-id: ${{ inputs.artifact_run_id }}');
    expect(workflow).toContain('actions: read');
  });
});

