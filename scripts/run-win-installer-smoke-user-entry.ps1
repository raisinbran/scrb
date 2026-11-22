# Child entry executed under the disposable standard-user token, never administrator.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Scratch,
    [Parameter(Mandatory)][string]$SourceSha,
    [Parameter(Mandatory)][string]$RunId,
    [Parameter(Mandatory)][string]$RunAttempt,
    [Parameter(Mandatory)][string]$TrustedManifestSha256,
    [Parameter(Mandatory)][string]$TrustedSourceCommit,
    [Parameter(Mandatory)][string]$TrustedProvenanceSha256,
    [Parameter(Mandatory)][string]$TrustedDependencyAuditSha256,
    [Parameter(Mandatory)][string]$TrustedProducerRunId,
    [Parameter(Mandatory)][string]$TrustedProducerRunAttempt
)
$ErrorActionPreference = 'Stop'
$env:GITHUB_ACTIONS = 'true'
$env:GITHUB_REPOSITORY = 'raisinbran/scrb'
$env:RUNNER_ENVIRONMENT = 'github-hosted'
$env:GITHUB_SHA = $SourceSha
$env:GITHUB_RUN_ID = $RunId
$env:GITHUB_RUN_ATTEMPT = $RunAttempt
$env:RUNNER_TEMP = [IO.Path]::GetFullPath($Scratch)
$env:USERPROFILE = [Environment]::GetFolderPath('UserProfile')
$env:APPDATA = [Environment]::GetFolderPath('ApplicationData')
$env:GITHUB_STEP_SUMMARY = ''
Import-Module (Join-Path $PSScriptRoot 'win-installer-smoke-guards.psm1') -Force
[void](Assert-SmokeIdentity)
$artifact = Join-Path $env:RUNNER_TEMP 'scribe-installer-artifact'
$manifestPath = Join-Path $artifact 'scribe-installer-candidate.json'
$files = @(Get-ChildItem -LiteralPath $artifact -File -Filter 'Scribe Setup *.exe')
if ($files.Count -ne 1) { throw 'Expected exactly one disposable NSIS candidate' }
$opts = @{
    InstallerPath = $files[0].FullName
    CandidateManifestPath = $manifestPath
    TrustedManifestSha256 = $TrustedManifestSha256
    TrustedSourceCommit = $TrustedSourceCommit
    TrustedProvenanceSha256 = $TrustedProvenanceSha256
    TrustedDependencyAuditSha256 = $TrustedDependencyAuditSha256
    TrustedProducerRunId = $TrustedProducerRunId
    TrustedProducerRunAttempt = $TrustedProducerRunAttempt
}
& (Join-Path $PSScriptRoot 'test-win-installer-smoke.ps1') @opts
$smokeExit = $LASTEXITCODE
$summary = Join-Path $env:RUNNER_TEMP 'scribe-installer-smoke-summary.json'
if (-not (Test-Path -LiteralPath $summary -PathType Leaf)) {
    throw 'A real installer smoke summary was not written'
}
$result = Get-Content -LiteralPath $summary -Raw | ConvertFrom-Json -ErrorAction Stop
if ($smokeExit -ne 0 -or $result.result -cne 'PASS' -or
    $result.currentCandidateIntegrity -cne 'PASS' -or
    $result.steps.perUserInstall -cne 'PASS' -or
    $result.steps.startMenuShortcut -cne 'PASS' -or
    $result.steps.uninstall -cne 'PASS' -or
    $result.steps.syntheticUserDataPreserved -cne 'PASS' -or
    $result.steps.cleanup -cne 'PASS') {
    throw 'Genuine hosted standard-user installer acceptance was not established'
}
exit 0
