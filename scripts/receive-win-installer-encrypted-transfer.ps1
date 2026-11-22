# Hosted consumer: decrypt, reject unsafe archives, and attest before installer launch.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TrustedManifestSha256,
    [Parameter(Mandatory)][string]$TrustedSourceCommit,
    [Parameter(Mandatory)][string]$TrustedProvenanceSha256,
    [Parameter(Mandatory)][string]$TrustedDependencyAuditSha256,
    [Parameter(Mandatory)][string]$TrustedProducerRunId,
    [Parameter(Mandatory)][string]$TrustedProducerRunAttempt
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'win-installer-encrypted-transfer.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'win-installer-candidate-trust.psm1') -Force
Assert-EncryptedInstallerDispatch -Job 'hosted-real-installer-smoke'
if ($TrustedSourceCommit -cne $env:GITHUB_SHA -or
    $TrustedProducerRunId -cne $env:GITHUB_RUN_ID -or
    $TrustedProducerRunAttempt -cne $env:GITHUB_RUN_ATTEMPT) {
    throw 'Producer source or first run attempt differs from executing consumer'
}
foreach ($hash in @($TrustedManifestSha256, $TrustedProvenanceSha256, $TrustedDependencyAuditSha256)) {
    if ($hash -cnotmatch '^[a-f0-9]{64}$') { throw 'Missing independent producer attestation' }
}
$download = Join-Path $env:RUNNER_TEMP 'scribe-encrypted-download'
Assert-TransferTempPath -Path $download -Name 'scribe-encrypted-download'
$artifact = Join-Path $env:RUNNER_TEMP 'scribe-installer-artifact'
Assert-TransferTempPath -Path $artifact -Name 'scribe-installer-artifact'
$files = @(Get-ChildItem -LiteralPath $download -Force -ErrorAction Stop)
if ($files.Count -ne 1 -or $files[0].Name -cne 'scribe-installer-candidate.age' -or
    $files[0].PSIsContainer -or
    ($files[0].Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Download contained more than the exact ciphertext file'
}
$cipher = $files[0].FullName
$scratch = Join-Path $env:RUNNER_TEMP ('scribe-age-decrypt-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $scratch) { throw 'Refusing reused decrypt scratch' }
New-Item -ItemType Directory -Path $scratch -ErrorAction Stop | Out-Null
$archive = Join-Path $scratch 'candidate.zip'
$verified = $false
try {
    $tools = Get-PinnedAgeTools -ToolRoot (Join-Path $scratch 'age-tool')
    Invoke-StrictAgeDecryption -AgeExe $tools.Age -CipherPath $cipher -ArchivePath $archive -IdentityRoot $scratch
    Expand-StrictInstallerArchive -ArchivePath $archive -DestinationRoot $artifact
    $candidateFiles = @(Get-AllowedInstallerFiles -Root $artifact)
    $installer = @($candidateFiles | Where-Object { $_.Name -cmatch '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$' })
    if ($installer.Count -ne 1) { throw 'Exactly one NSIS installer is required' }
    $parameters = @{
        CandidateManifestPath = (Join-Path $artifact 'scribe-installer-candidate.json')
        InstallerPath = $installer[0].FullName
        ArtifactRoot = $artifact
        TrustedManifestSha256 = $TrustedManifestSha256
        TrustedSourceCommit = $TrustedSourceCommit
        TrustedProvenanceSha256 = $TrustedProvenanceSha256
        TrustedDependencyAuditSha256 = $TrustedDependencyAuditSha256
        TrustedProducerRunId = $TrustedProducerRunId
        TrustedProducerRunAttempt = $TrustedProducerRunAttempt
    }
    [void](Assert-TrustedCandidate @parameters)
    $verified = $true
} finally {
    if (Test-Path -LiteralPath $scratch) {
        Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction Stop
    }
    if (-not $verified -and (Test-Path -LiteralPath $artifact)) {
        Remove-Item -LiteralPath $artifact -Recurse -Force -ErrorAction Stop
    }
}
Write-Output 'Decryption, archive validation and six-output independent candidate trust PASS; installer NOT YET LAUNCHED'
