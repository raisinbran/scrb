# Synthetic-only; never executes a real installer or creates a user account.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'run-win-installer-single-runner.ps1')

function Expect-Refused([scriptblock]$Action, [string]$Description) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Failed to refuse $Description" }
}
$facts = @{
    Actions = 'true'; Runner = 'github-hosted'; Event = 'workflow_dispatch'
    Repository = 'raisinbran/scrb'; Actor = 'raisinbran'; TriggeringActor = 'raisinbran'
    Ref = 'refs/heads/main'
    WorkflowRef = 'raisinbran/scrb/.github/workflows/windows-installer-single-runner-smoke.yml@refs/heads/main'
    Job = 'verified-installer-producer'; Attempt = '1'
    BuildOptIn = 'true'; NoUploadOptIn = 'true'
    Sha = ('a' * 40); ExpectedSha = ('a' * 40)
}
if (-not (Test-SingleRunnerDispatchFacts $facts)) { throw 'Refused correctly authorized synthetic dispatch' }
foreach ($entry in @(
    @('Actor','attacker'), @('TriggeringActor','attacker'), @('Ref','refs/heads/feature'),
    @('WorkflowRef','raisinbran/scrb/.github/workflows/other.yml@refs/heads/main'),
    @('Repository','other/repo'), @('Event','pull_request'), @('Attempt','2'),
    @('BuildOptIn','false'), @('NoUploadOptIn','false'), @('ExpectedSha',('b'*40)),
    @('Sha','invalid'), @('Job','hosted-real-installer-smoke'), @('Runner','self-hosted')
)) {
    $field = $entry[0]; $old = $facts[$field]
    $facts[$field] = $entry[1]
    if (Test-SingleRunnerDispatchFacts $facts) { throw "Accepted forbidden $field" }
    $facts[$field] = $old
}
$oldTemp = $env:RUNNER_TEMP
$oldActions = $env:GITHUB_ACTIONS
$oldRunner = $env:RUNNER_ENVIRONMENT
$oldRepo = $env:GITHUB_REPOSITORY
$oldSha = $env:GITHUB_SHA
$oldId = $env:GITHUB_RUN_ID
$oldAttempt = $env:GITHUB_RUN_ATTEMPT
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('scribe-local-fixtures-' + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $env:RUNNER_TEMP = $testRoot
    $env:GITHUB_ACTIONS = 'true'
    $env:RUNNER_ENVIRONMENT = 'github-hosted'
    $env:GITHUB_REPOSITORY = 'raisinbran/scrb'
    $env:GITHUB_SHA = 'a' * 40
    $env:GITHUB_RUN_ID = '81234'
    $env:GITHUB_RUN_ATTEMPT = '1'
    $root = Join-Path $testRoot 'scribe-installer-artifact'
    New-Item -ItemType Directory -Path $root | Out-Null
    $bytes = @{
        'Scribe Setup 1.2.3.exe' = 'invented NSIS bytes'
        'Scribe.exe' = 'invented app bytes'
        'PROVENANCE.json' = '{"invented":true}'
        'DEPENDENCY-AUDIT.json' = '{"invented":true}'
    }
    foreach ($name in $bytes.Keys) {
        [IO.File]::WriteAllText((Join-Path $root $name), $bytes[$name])
    }
    function Record([string]$Name) {
        $p = Join-Path $root $Name
        return @{ name = $Name; bytes = (Get-Item -LiteralPath $p).Length
                  sha256 = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $manifest = @{
        schemaVersion = 1; installMode = 'perUser'; sourceCommit = ('a'*40)
        installer = (Record 'Scribe Setup 1.2.3.exe')
        application = (Record 'Scribe.exe')
        provenance = (Record 'PROVENANCE.json')
        dependencyAudit = (Record 'DEPENDENCY-AUDIT.json')
    }
    $manifestPath = Join-Path $root 'scribe-installer-candidate.json'
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath
    $hash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $trusted = @{
        CandidateManifestPath = $manifestPath
        InstallerPath = (Join-Path $root 'Scribe Setup 1.2.3.exe')
        ArtifactRoot = $root
        TrustedManifestSha256 = $hash; TrustedSourceCommit = ('a'*40)
        TrustedProvenanceSha256 = $manifest.provenance.sha256
        TrustedDependencyAuditSha256 = $manifest.dependencyAudit.sha256
        TrustedProducerRunId = '81234'; TrustedProducerRunAttempt = '1'
    }
    Import-Module (Join-Path $PSScriptRoot 'win-installer-candidate-trust.psm1') -Force
    if (-not (Assert-SingleRunnerFileSet $root)) { throw 'Refused correct five-file fixture' }
    $evidence = Assert-SingleRunnerEvidence -Root $root -ManifestSha $hash -SourceSha ('a'*40) -ProvenanceSha $trusted.TrustedProvenanceSha256 -AuditSha $trusted.TrustedDependencyAuditSha256 -RunId '81234' -Attempt '1'
    if ($evidence.SourceCommit -cne ('a'*40)) { throw 'Source identity not validated' }
    $launches = 0
    Expect-Refused { Invoke-TrustedCandidateInstall -Verification ($trusted + @{ TrustedManifestSha256 = ('b'*64) }) -Launch { $script:launches++ } } 'wrong trusted manifest'
    if ($launches -ne 0) { throw 'Untrusted installer was launched' }
    [IO.File]::AppendAllText($trusted.InstallerPath, 'altered')
    Expect-Refused { Assert-TrustedCandidate @trusted } 'modified installer'
    $manifest.installer = Record 'Scribe Setup 1.2.3.exe'
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath
    Expect-Refused { Assert-TrustedCandidate @trusted } 'modified installer plus forged local manifest'
    if ($launches -ne 0) { throw 'Tampered candidate launched an executable' }
    [IO.File]::WriteAllText((Join-Path $root 'unexpected.exe'), 'invented')
    Expect-Refused { Assert-SingleRunnerFileSet $root } 'extra file'
    Remove-Item -LiteralPath (Join-Path $root 'unexpected.exe')
    Remove-Item -LiteralPath (Join-Path $root 'DEPENDENCY-AUDIT.json')
    Expect-Refused { Assert-SingleRunnerFileSet $root } 'missing audit'
    $outside = Join-Path $testRoot 'outside'
    New-Item -ItemType Directory -Path $outside | Out-Null
    Expect-Refused { Assert-SingleRunnerRoot $outside } 'arbitrary runner root'
    Write-Output 'Single-runner invented dispatch, exact five-file, hash and zero-launch refusals PASS'
} finally {
    $env:RUNNER_TEMP = $oldTemp; $env:GITHUB_ACTIONS = $oldActions
    $env:RUNNER_ENVIRONMENT = $oldRunner; $env:GITHUB_REPOSITORY = $oldRepo
    $env:GITHUB_SHA = $oldSha; $env:GITHUB_RUN_ID = $oldId
    $env:GITHUB_RUN_ATTEMPT = $oldAttempt
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction Stop
    }
}
