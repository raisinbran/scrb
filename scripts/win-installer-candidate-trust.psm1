# Consumer-only attestation. Trust values must come from protected producer job
# outputs, never from files downloaded in scribe-installer-artifact.
Set-StrictMode -Version Latest

function Assert-CandidateFile {
    param([string]$Path, [string]$Root, [string]$Name, [long]$MaxBytes = 0)
    $full = [IO.Path]::GetFullPath($Path)
    $parent = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if (-not [string]::Equals([IO.Path]::GetDirectoryName($full), $parent,
            [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals([IO.Path]::GetFileName($full), $Name,
            [StringComparison]::Ordinal)) {
        throw "Candidate path/name is outside the isolated artifact root: $Name"
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing candidate file: $Name" }
    $item = Get-Item -LiteralPath $full -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $item.Length -le 0 -or ($MaxBytes -gt 0 -and $item.Length -gt $MaxBytes)) {
        throw "Candidate file is linked, empty or oversized: $Name"
    }
    return $full
}

function Assert-CandidateHash {
    param([string]$Path, $Record)
    if ($null -eq $Record -or [string]$Record.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
        [long]$Record.bytes -le 0 -or [long]$Record.bytes -ne (Get-Item -LiteralPath $Path).Length) {
        throw 'Candidate size or digest metadata is invalid'
    }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -cne [string]$Record.sha256) {
        throw 'Candidate bytes differ from independently bound manifest'
    }
}

function Assert-TrustedCandidate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$CandidateManifestPath,
        [Parameter(Mandatory)][string]$InstallerPath,
        [Parameter(Mandatory)][string]$ArtifactRoot,
        [Parameter(Mandatory)][string]$TrustedManifestSha256,
        [Parameter(Mandatory)][string]$TrustedSourceCommit,
        [Parameter(Mandatory)][string]$TrustedProvenanceSha256,
        [Parameter(Mandatory)][string]$TrustedDependencyAuditSha256,
        [Parameter(Mandatory)][string]$TrustedProducerRunId,
        [Parameter(Mandatory)][string]$TrustedProducerRunAttempt
    )
    # GitHub source, repository and run identity must agree with the independent
    # producer-job outputs. The downloaded artifact supplies NONE of these values.
    if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
        $env:GITHUB_REPOSITORY -cne 'raisinbran/scrb' -or
        $env:GITHUB_SHA -cnotmatch '^[a-f0-9]{40}$' -or
        $env:GITHUB_RUN_ID -cnotmatch '^[0-9]+$' -or
        $env:GITHUB_RUN_ATTEMPT -cnotmatch '^[1-9][0-9]*$') {
        throw 'Verified hosted workflow context is unavailable'
    }
    foreach ($sha in @($TrustedManifestSha256, $TrustedProvenanceSha256, $TrustedDependencyAuditSha256)) {
        if ($sha -cnotmatch '^[a-f0-9]{64}$') { throw 'Missing independently trusted SHA-256' }
    }
    if ($TrustedSourceCommit -cne $env:GITHUB_SHA -or
        $TrustedProducerRunId -cne $env:GITHUB_RUN_ID -or
        $TrustedProducerRunAttempt -cne $env:GITHUB_RUN_ATTEMPT) {
        throw 'Trusted producer identity differs from the executing hosted run'
    }
    if (-not $env:RUNNER_TEMP) { throw 'Missing runner temporary directory' }
    $root = [IO.Path]::GetFullPath($ArtifactRoot).TrimEnd('\', '/')
    $allowed = [IO.Path]::GetFullPath(
        (Join-Path $env:RUNNER_TEMP 'scribe-installer-artifact')).TrimEnd('\', '/')
    if (-not [string]::Equals($root, $allowed, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Candidate root is not the disposable artifact directory'
    }
    if (-not (Test-Path -LiteralPath $root -PathType Container) -or
        ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Candidate artifact root is missing or linked'
    }
    $manifestPath = Assert-CandidateFile -Path $CandidateManifestPath -Root $root -Name 'scribe-installer-candidate.json' -MaxBytes 16384
    $actualManifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualManifestHash -cne $TrustedManifestSha256) {
        throw 'Candidate manifest SHA-256 does not match the separate trusted producer'
    }
    $candidate = Get-Content -LiteralPath $manifestPath -Raw |
        ConvertFrom-Json -Depth 16 -ErrorAction Stop
    if ($candidate.schemaVersion -ne 1 -or $candidate.installMode -cne 'perUser' -or
        $candidate.sourceCommit -cne $TrustedSourceCommit) {
        throw 'Candidate source/installation identity differs from trusted producer'
    }
    if ([string]$candidate.installer.name -cnotmatch '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$' -or
        $candidate.application.name -cne 'Scribe.exe' -or
        $candidate.provenance.name -cne 'PROVENANCE.json' -or
        $candidate.dependencyAudit.name -cne 'DEPENDENCY-AUDIT.json') {
        throw 'Candidate manifest contains invalid artifact names'
    }
    if ($candidate.provenance.sha256 -cne $TrustedProvenanceSha256 -or
        $candidate.dependencyAudit.sha256 -cne $TrustedDependencyAuditSha256) {
        throw 'Stage metadata is not bound to the trusted producer'
    }
    $verifiedFiles = @{}
    foreach ($field in @('installer', 'application', 'provenance', 'dependencyAudit')) {
        $record = $candidate.$field
        $file = Assert-CandidateFile -Path (Join-Path $root ([string]$record.name)) -Root $root -Name ([string]$record.name)
        Assert-CandidateHash -Path $file -Record $record
        $verifiedFiles[$field] = $file
    }
    if (-not [string]::Equals([IO.Path]::GetFullPath($InstallerPath), $verifiedFiles.installer,
            [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Installer path differs from the trusted candidate'
    }
    return [pscustomobject]@{
        InstallerPath = $verifiedFiles.installer
        ApplicationSha256 = [string]$candidate.application.sha256
        SourceCommit = [string]$candidate.sourceCommit
        ManifestSha256 = $actualManifestHash
    }
}

# The actual smoke and its invented-data regression share this pre-launch gate.
# Launch is called ONLY after the complete independent attestation succeeds.
function Invoke-TrustedCandidateInstall {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Verification,
        [Parameter(Mandatory)][scriptblock]$Launch
    )
    $verified = Assert-TrustedCandidate @Verification
    & $Launch $verified.InstallerPath | Out-Null
    return $verified
}

Export-ModuleMember -Function Assert-TrustedCandidate, Invoke-TrustedCandidateInstall
