# Synthetic-only encryption and archive validation; never executes an installer.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'win-installer-encrypted-transfer.psm1') -Force
$base = Join-Path ([IO.Path]::GetTempPath()) ('scrb-age-test-' + [guid]::NewGuid().ToString('N'))
$runner = Join-Path $base 'runner'
$candidate = Join-Path $runner 'scribe-installer-artifact'
$names = @('Scribe Setup 0.1.0.exe','Scribe.exe','scribe-installer-candidate.json','PROVENANCE.json','DEPENDENCY-AUDIT.json')
$variables = @('RUNNER_TEMP','RUNNER_ENVIRONMENT','GITHUB_ACTIONS','GITHUB_EVENT_NAME','GITHUB_REPOSITORY','GITHUB_ACTOR','GITHUB_TRIGGERING_ACTOR','GITHUB_REF','GITHUB_WORKFLOW_REF','GITHUB_RUN_ATTEMPT','GITHUB_RUN_ID','GITHUB_SHA','GITHUB_JOB','SCRB_GENUINE_INSTALLER_AUTHORIZED','SCRB_ENCRYPTED_INSTALLER_AUTHORIZED','WIN_INSTALLER_SMOKE_AGE_IDENTITY')
$old = @{}
foreach ($name in $variables) { $old[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$script:launches = 0
function MustReject([scriptblock]$Action, [string]$Label) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Missing refusal: $Label" }
    if ($script:launches -ne 0) { throw "Untrusted installer reached launch callback: $Label" }
}
function Write-TestZip([string]$Path,[string[]]$Names,[int]$Repeats = 1) {
    Add-Type -AssemblyName System.IO.Compression
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew)
    try {
        $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($name in $Names) {
                $entry = $zip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
                $entry.ExternalAttributes = 32
                $entryStream = $entry.Open()
                try {
                    $bytes = [Text.Encoding]::UTF8.GetBytes(('invented-bytes-' * $Repeats))
                    $entryStream.Write($bytes,0,$bytes.Length)
                } finally { $entryStream.Dispose() }
            }
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
}
try {
    New-Item -ItemType Directory -Path $candidate -Force | Out-Null
    $env:RUNNER_TEMP = $runner
    $env:RUNNER_ENVIRONMENT = 'github-hosted'
    $env:GITHUB_ACTIONS = 'true'
    $env:GITHUB_EVENT_NAME = 'workflow_dispatch'
    $env:GITHUB_REPOSITORY = 'raisinbran/scrb'
    $env:GITHUB_ACTOR = 'raisinbran'
    $env:GITHUB_TRIGGERING_ACTOR = 'raisinbran'
    $env:GITHUB_REF = 'refs/heads/main'
    $env:GITHUB_WORKFLOW_REF = 'raisinbran/scrb/.github/workflows/windows-installer-smoke.yml@refs/heads/main'
    $env:GITHUB_RUN_ATTEMPT = '1'
    $env:GITHUB_RUN_ID = '123456'
    $env:GITHUB_SHA = 'a' * 40
    $env:GITHUB_JOB = 'verified-installer-producer'
    $env:SCRB_GENUINE_INSTALLER_AUTHORIZED = 'true'
    $env:SCRB_ENCRYPTED_INSTALLER_AUTHORIZED = 'true'
    Assert-EncryptedInstallerDispatch -Job 'verified-installer-producer'
    foreach ($key in @('GITHUB_ACTOR','GITHUB_TRIGGERING_ACTOR','GITHUB_REF','GITHUB_WORKFLOW_REF','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME','SCRB_ENCRYPTED_INSTALLER_AUTHORIZED')) {
        $value = [Environment]::GetEnvironmentVariable($key,'Process')
        [Environment]::SetEnvironmentVariable($key,'invalid','Process')
        MustReject { Assert-EncryptedInstallerDispatch -Job 'verified-installer-producer' } $key
        [Environment]::SetEnvironmentVariable($key,$value,'Process')
    }
    MustReject { Assert-EncryptedInstallerDispatch -Job 'hosted-real-installer-smoke' } 'wrong producer job'
    foreach ($name in $names) { [IO.File]::WriteAllText((Join-Path $candidate $name),('fictional ' + $name)) }
    $extra = Join-Path $candidate 'private-model.bin'
    [IO.File]::WriteAllText($extra,'invented extra')
    MustReject { Get-AllowedInstallerFiles -Root $candidate } 'extra candidate file'
    Remove-Item -LiteralPath $extra
    [void](Get-AllowedInstallerFiles -Root $candidate)
    $zipPath = Join-Path $base 'candidate.zip'
    New-StrictInstallerArchive -CandidateRoot $candidate -ArchivePath $zipPath
    Expand-StrictInstallerArchive -ArchivePath $zipPath -DestinationRoot (Join-Path $base 'unpacked')
    $tools = Get-PinnedAgeTools -ToolRoot (Join-Path $base 'age-tools')
    $identity = Join-Path $base 'test-key'
    & $tools.Keygen -o $identity | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic age-keygen failed' }
    $recipient = (& $tools.Keygen -y $identity).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic age recipient derivation failed' }
    $cipher = Join-Path $base 'candidate.age'
    Invoke-StrictAgeEncryption -AgeExe $tools.Age -Recipient $recipient -ArchivePath $zipPath -CipherPath $cipher
    $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY = Get-Content -LiteralPath $identity |
        Where-Object { $_ -match '^AGE-SECRET-KEY-' } | Select-Object -First 1
    $out = Join-Path $base 'decrypted.zip'
    Invoke-StrictAgeDecryption -AgeExe $tools.Age -CipherPath $cipher -ArchivePath $out -IdentityRoot $base
    Expand-StrictInstallerArchive -ArchivePath $out -DestinationRoot (Join-Path $base 'roundtrip')
    $secret = $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY
    $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY = ''
    MustReject { Invoke-StrictAgeDecryption -AgeExe $tools.Age -CipherPath $cipher -ArchivePath (Join-Path $base 'no-secret.zip') -IdentityRoot $base } 'missing secret'
    $other = Join-Path $base 'other-key'
    & $tools.Keygen -o $other | Out-Null
    $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY = Get-Content -LiteralPath $other |
        Where-Object { $_ -match '^AGE-SECRET-KEY-' } | Select-Object -First 1
    MustReject { Invoke-StrictAgeDecryption -AgeExe $tools.Age -CipherPath $cipher -ArchivePath (Join-Path $base 'wrong-key.zip') -IdentityRoot $base } 'wrong key'
    $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY = $secret
    [byte[]]$tamperedBytes = [IO.File]::ReadAllBytes($cipher)
    $tamperedBytes[$tamperedBytes.Length - 1] = $tamperedBytes[$tamperedBytes.Length - 1] -bxor 1
    $tampered = Join-Path $base 'tampered.age'
    [IO.File]::WriteAllBytes($tampered,$tamperedBytes)
    MustReject { Invoke-StrictAgeDecryption -AgeExe $tools.Age -CipherPath $tampered -ArchivePath (Join-Path $base 'tampered.zip') -IdentityRoot $base } 'tampered ciphertext'
    $unsafe = @(
        @('../escape','Scribe.exe','PROVENANCE.json','DEPENDENCY-AUDIT.json','Scribe Setup 0.1.0.exe'),
        @('Scribe.exe','scribe.exe','PROVENANCE.json','DEPENDENCY-AUDIT.json','Scribe Setup 0.1.0.exe'),
        @('Scribe.exe','Scribe.exe','PROVENANCE.json','DEPENDENCY-AUDIT.json','Scribe Setup 0.1.0.exe'),
        @('Scribe.exe','nested/file','PROVENANCE.json','DEPENDENCY-AUDIT.json','Scribe Setup 0.1.0.exe'),
        @('Scribe.exe','C:evil','PROVENANCE.json','DEPENDENCY-AUDIT.json','Scribe Setup 0.1.0.exe'),
        @('Scribe.exe','unknown','PROVENANCE.json','DEPENDENCY-AUDIT.json','Scribe Setup 0.1.0.exe')
    )
    $i = 0
    foreach ($set in $unsafe) {
        $unsafeZip = Join-Path $base "unsafe-$i.zip"
        Write-TestZip -Path $unsafeZip -Names $set
        $dest = Join-Path $base "bad-$i"
        MustReject { Expand-StrictInstallerArchive -ArchivePath $unsafeZip -DestinationRoot $dest } "unsafe archive $i"
        if (Test-Path -LiteralPath $dest) { throw 'Archive extracted before validation' }
        $i++
    }
    $bomb = Join-Path $base 'bomb.zip'
    Write-TestZip -Path $bomb -Names $names -Repeats 5000
    MustReject { Expand-StrictInstallerArchive -ArchivePath $bomb -DestinationRoot (Join-Path $base 'bomb-output') } 'compressed amplification'
    if ($script:launches -ne 0) { throw 'Executable unexpectedly launched' }
    Write-Output 'Encrypted transfer synthetic protections PASS'
} finally {
    foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name,$old[$name],'Process') }
    if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction Stop }
}
