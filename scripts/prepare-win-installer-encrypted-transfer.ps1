# Host-only ciphertext creation; no plaintext enters the Actions artifact upload root.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$CandidateRoot,
    [Parameter(Mandatory)][string]$RecipientFile
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'win-installer-encrypted-transfer.psm1') -Force
Assert-EncryptedInstallerDispatch -Job 'verified-installer-producer'
Assert-TransferTempPath -Path $CandidateRoot -Name 'scribe-installer-artifact'
$recipient = Get-PinnedInstallerRecipient -RecipientFile $RecipientFile
[void](Get-AllowedInstallerFiles -Root $CandidateRoot)

$uploadRoot = Join-Path $env:RUNNER_TEMP 'scribe-encrypted-upload'
$scratch = Join-Path $env:RUNNER_TEMP ('scribe-age-work-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $uploadRoot) { throw 'Refusing preexisting ciphertext upload root' }
if (Test-Path -LiteralPath $scratch) { throw 'Refusing preexisting encryption scratch' }
New-Item -ItemType Directory -Path $scratch -ErrorAction Stop | Out-Null
$archive = Join-Path $scratch 'candidate.zip'
$cipher = Join-Path $uploadRoot 'scribe-installer-candidate.age'
$completed = $false
try {
    $tools = Get-PinnedAgeTools -ToolRoot (Join-Path $scratch 'age-tool')
    New-StrictInstallerArchive -CandidateRoot $CandidateRoot -ArchivePath $archive
    New-Item -ItemType Directory -Path $uploadRoot -ErrorAction Stop | Out-Null
    Invoke-StrictAgeEncryption -AgeExe $tools.Age -Recipient $recipient -ArchivePath $archive -CipherPath $cipher
    $entries = @(Get-ChildItem -LiteralPath $uploadRoot -Force -ErrorAction Stop)
    if ($entries.Count -ne 1 -or $entries[0].Name -cne 'scribe-installer-candidate.age' -or
        $entries[0].PSIsContainer -or
        ($entries[0].Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Refusing artifact tree containing non-ciphertext material'
    }
    $completed = $true
} finally {
    if (Test-Path -LiteralPath $scratch) {
        Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction Stop
    }
    if (-not $completed -and (Test-Path -LiteralPath $uploadRoot)) {
        Remove-Item -LiteralPath $uploadRoot -Recurse -Force -ErrorAction Stop
    }
}
Write-Output 'Encrypted candidate prepared; ciphertext is the only uploadable file'
