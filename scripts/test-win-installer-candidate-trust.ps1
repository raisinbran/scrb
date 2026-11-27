# Invented-byte producer/consumer integration test: NEVER starts an installer.
# It tests the same Invoke-TrustedCandidateInstall used by the real smoke.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'win-installer-candidate-trust.psm1') -Force
$base = Join-Path ([IO.Path]::GetTempPath()) ('scrb-installer-trust-test-' + [guid]::NewGuid().ToString('N'))
$runner = Join-Path $base 'runner'
$artifact = Join-Path $runner 'scribe-installer-artifact'
$environmentNames = @(
    'RUNNER_TEMP', 'RUNNER_ENVIRONMENT', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY',
    'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'SCRB_TRUST_TEST_MARKER'
)
$original = @{}
foreach ($name in $environmentNames) {
    $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function New-Record([string]$Path) {
    return [ordered]@{
        name = [IO.Path]::GetFileName($Path)
        bytes = (Get-Item -LiteralPath $Path).Length
        sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
function Write-Manifest($Manifest, [string]$Path) {
    $json = $Manifest | ConvertTo-Json -Depth 12
    [IO.File]::WriteAllText($Path, $json, [Text.UTF8Encoding]::new($false))
}
function Assert-RejectsBeforeLaunch([hashtable]$Evidence, [string]$ExpectedError) {
    $marker = $env:SCRB_TRUST_TEST_MARKER
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
    $rejected = $false
    try {
        Invoke-TrustedCandidateInstall -Verification $Evidence -Launch {
            param([string]$candidate)
            [IO.File]::WriteAllText($env:SCRB_TRUST_TEST_MARKER, $candidate)
        } | Out-Null
    } catch {
        if ($_.Exception.Message -notmatch $ExpectedError) { throw }
        $rejected = $true
    }
    if (-not $rejected -or (Test-Path -LiteralPath $marker)) {
        throw 'Untrusted candidate reached executable launch callback'
    }
}
try {
    New-Item -ItemType Directory -Path $artifact -Force | Out-Null
    $env:RUNNER_TEMP = $runner
    $env:RUNNER_ENVIRONMENT = 'github-hosted'
    $env:GITHUB_ACTIONS = 'true'
    $env:GITHUB_REPOSITORY = 'raisinbran/scrb'
    $env:GITHUB_SHA = 'a' * 40
    $env:GITHUB_RUN_ID = '1234567'
    $env:GITHUB_RUN_ATTEMPT = '1'
    $env:SCRB_TRUST_TEST_MARKER = Join-Path $base 'launch-marker'
    $installer = Join-Path $artifact 'Scribe Setup 0.2.0.exe'
    $application = Join-Path $artifact 'Scribe.exe'
    $provenance = Join-Path $artifact 'PROVENANCE.json'
    $audit = Join-Path $artifact 'DEPENDENCY-AUDIT.json'
    $manifestPath = Join-Path $artifact 'scribe-installer-candidate.json'
    [IO.File]::WriteAllText($installer, 'invented safe NSIS bytes')
    [IO.File]::WriteAllText($application, 'invented application')
    [IO.File]::WriteAllText($provenance, '{"stagedFiles":[],"source":"invented"}')
    [IO.File]::WriteAllText($audit, '{"files":[],"source":"invented"}')
    $manifest = [ordered]@{
        schemaVersion = 1
        sourceCommit = $env:GITHUB_SHA
        installMode = 'perUser'
        installer = (New-Record $installer)
        application = (New-Record $application)
        provenance = (New-Record $provenance)
        dependencyAudit = (New-Record $audit)
    }
    Write-Manifest $manifest $manifestPath
    # Capture trusted evidence BEFORE mutating the downloadable artifact set.
    # In production these fields come only from protected producer-job outputs.
    $trusted = @{
        CandidateManifestPath = $manifestPath
        InstallerPath = $installer
        ArtifactRoot = $artifact
        TrustedManifestSha256 = (Get-FileHash $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
        TrustedSourceCommit = $env:GITHUB_SHA
        TrustedProvenanceSha256 = $manifest.provenance.sha256
        TrustedDependencyAuditSha256 = $manifest.dependencyAudit.sha256
        TrustedProducerRunId = $env:GITHUB_RUN_ID
        TrustedProducerRunAttempt = $env:GITHUB_RUN_ATTEMPT
    }
    # Positive control: callback is wired and can run ONLY after verification.
    $accepted = Invoke-TrustedCandidateInstall -Verification $trusted -Launch {
        param([string]$candidate)
        [IO.File]::WriteAllText($env:SCRB_TRUST_TEST_MARKER, $candidate)
    }
    if (-not (Test-Path -LiteralPath $env:SCRB_TRUST_TEST_MARKER) -or
        $accepted.SourceCommit -cne $env:GITHUB_SHA) {
        throw 'Positive trust fixture failed before mutation'
    }

    # P1 regression: replace BOTH NSIS installer and candidate JSON with
    # internally consistent new hashes, but DO NOT change producer evidence.
    [IO.File]::WriteAllText($installer, 'invented substituted NSIS payload')
    $manifest.installer = New-Record $installer
    Write-Manifest $manifest $manifestPath
    Assert-RejectsBeforeLaunch $trusted 'manifest SHA-256'

    # Even if attacker knows the new manifest hash, the trusted source/run and
    # stage digests cannot be rewritten by altering the candidate artifact.
    $forgedDigest = $trusted.Clone()
    $forgedDigest.TrustedManifestSha256 = (Get-FileHash $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $forgedDigest.TrustedSourceCommit = 'b' * 40
    Assert-RejectsBeforeLaunch $forgedDigest 'producer identity'

    # A substituted staging report cannot be excused by rehashing the candidate.
    [IO.File]::WriteAllText($provenance, '{"stagedFiles":[],"source":"forged"}')
    $manifest.provenance = New-Record $provenance
    Write-Manifest $manifest $manifestPath
    $forgedStage = $trusted.Clone()
    $forgedStage.TrustedManifestSha256 = (Get-FileHash $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-RejectsBeforeLaunch $forgedStage 'Stage metadata'

    # Absent out-of-band attestation fails closed.
    $missing = $trusted.Clone()
    $missing.Remove('TrustedManifestSha256')
    Assert-RejectsBeforeLaunch $missing 'TrustedManifestSha256|mandatory'

    Write-Output 'Candidate producer/consumer trust and joint-substitution launch guard PASS'
} finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process')
    }
    if (Test-Path -LiteralPath $base) {
        Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction Stop
    }
}
