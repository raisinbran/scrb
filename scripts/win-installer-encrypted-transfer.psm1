# Source-only encrypted transfer for the trusted hosted Windows installer.
# Public artifacts must contain ciphertext only. This module never invokes an installer.
Set-StrictMode -Version Latest

$script:AgeVersion = 'v1.3.2'
$script:AgeArchiveSha256 = 'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7'
$script:MaxCipherBytes = 1073741824L
$script:MaxArchiveBytes = 1073741824L
$script:MaxTotalExpandedBytes = 1048576000L
$script:MaxInstallerBytes = 629145600L
$script:MaxApplicationBytes = 629145600L
$script:MaxMetadataBytes = 20971520L

function Assert-EncryptedInstallerDispatch {
    [CmdletBinding()]
    param([Parameter(Mandatory)][ValidateSet('verified-installer-producer', 'hosted-real-installer-smoke')][string]$Job)

    if ($env:GITHUB_ACTIONS -cne 'true' -or
        $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
        $env:GITHUB_EVENT_NAME -cne 'workflow_dispatch' -or
        $env:GITHUB_REPOSITORY -cne 'raisinbran/scrb' -or
        $env:GITHUB_ACTOR -cne 'raisinbran' -or
        $env:GITHUB_TRIGGERING_ACTOR -cne 'raisinbran' -or
        $env:GITHUB_REF -cne 'refs/heads/main' -or
        $env:GITHUB_WORKFLOW_REF -cne 'raisinbran/scrb/.github/workflows/windows-installer-smoke.yml@refs/heads/main' -or
        $env:GITHUB_RUN_ATTEMPT -cne '1' -or
        $env:GITHUB_RUN_ID -cnotmatch '^[1-9][0-9]*$' -or
        $env:GITHUB_SHA -cnotmatch '^[a-f0-9]{40}$' -or
        $env:GITHUB_JOB -cne $Job -or
        $env:SCRB_GENUINE_INSTALLER_AUTHORIZED -cne 'true' -or
        $env:SCRB_ENCRYPTED_INSTALLER_AUTHORIZED -cne 'true') {
        throw 'Encrypted installer transfer requires an exact first-attempt owner dispatch on protected main'
    }
}

function Assert-TransferTempPath {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Name)
    if (-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP is missing' }
    $runner = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\', '/')
    $expected = [IO.Path]::GetFullPath((Join-Path $runner $Name))
    $actual = [IO.Path]::GetFullPath($Path)
    if (-not [string]::Equals($expected, $actual, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Encrypted transfer path escapes its fixed runner temporary root'
    }
    $root = Get-Item -LiteralPath $runner -Force -ErrorAction Stop
    if (-not $root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Runner temporary root is not a real directory'
    }
}

function Get-AllowedInstallerFiles {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Root)
    $directory = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
    if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Candidate directory is missing or linked'
    }
    $files = @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction Stop)
    if ($files.Count -ne 5) { throw 'Candidate must contain exactly five top-level files' }
    $expected = @('Scribe.exe', 'scribe-installer-candidate.json', 'PROVENANCE.json', 'DEPENDENCY-AUDIT.json')
    $installer = @($files | Where-Object { $_.Name -cmatch '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$' })
    if ($installer.Count -ne 1) { throw 'Candidate must contain exactly one versioned NSIS installer' }
    $expected += $installer[0].Name
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $files) {
        if ($file.PSIsContainer -or
            ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
            -not $seen.Add($file.Name) -or
            $file.Name -cnotin $expected -or
            $file.Length -le 0) {
            throw 'Unapproved, linked, empty, nested or duplicate candidate file'
        }
        $limit = if ($file.Name -eq 'Scribe.exe') { $script:MaxApplicationBytes }
            elseif ($file.Name -clike 'Scribe Setup *.exe') { $script:MaxInstallerBytes }
            else { $script:MaxMetadataBytes }
        if ($file.Length -gt $limit) { throw 'Candidate file exceeds its size limit' }
    }
    return @($expected | ForEach-Object { Get-Item -LiteralPath (Join-Path $Root $_) -Force -ErrorAction Stop })
}

function New-StrictInstallerArchive {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$CandidateRoot, [Parameter(Mandatory)][string]$ArchivePath)
    $files = @(Get-AllowedInstallerFiles -Root $CandidateRoot)
    if (Test-Path -LiteralPath $ArchivePath) { throw 'Refusing to reuse an archive path' }
    $sum = [long]0
    foreach ($file in $files) { $sum += $file.Length }
    if ($sum -gt $script:MaxTotalExpandedBytes) { throw 'Candidate aggregate size exceeds policy' }

    Add-Type -AssemblyName System.IO.Compression
    $output = [IO.File]::Open($ArchivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $zip = [IO.Compression.ZipArchive]::new($output, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($file in $files) {
                $entry = $zip.CreateEntry($file.Name, [IO.Compression.CompressionLevel]::Optimal)
                $entry.ExternalAttributes = 32 # DOS archive/regular-file attribute, no links.
                $input = [IO.File]::OpenRead($file.FullName)
                try {
                    $entryStream = $entry.Open()
                    try { $input.CopyTo($entryStream) }
                    finally { $entryStream.Dispose() }
                } finally { $input.Dispose() }
            }
        } finally { $zip.Dispose() }
    } finally { $output.Dispose() }
    if ((Get-Item -LiteralPath $ArchivePath).Length -gt $script:MaxArchiveBytes) {
        throw 'Compressed candidate exceeds upload policy'
    }
}

function Expand-StrictInstallerArchive {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ArchivePath, [Parameter(Mandatory)][string]$DestinationRoot)
    $archive = Get-Item -LiteralPath $ArchivePath -Force -ErrorAction Stop
    if ($archive.PSIsContainer -or
        ($archive.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $archive.Length -le 0 -or $archive.Length -gt $script:MaxArchiveBytes) {
        throw 'Candidate archive is linked, empty or oversized'
    }
    if (Test-Path -LiteralPath $DestinationRoot) { throw 'Refusing to extract into an existing root' }

    Add-Type -AssemblyName System.IO.Compression
    $input = [IO.File]::OpenRead($ArchivePath)
    try {
        $zip = [IO.Compression.ZipArchive]::new($input, [IO.Compression.ZipArchiveMode]::Read, $true)
        try {
            $entries = @($zip.Entries)
            if ($entries.Count -ne 5) { throw 'Archive must contain exactly five entries' }
            $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
            $total = [long]0
            $installerCount = 0
            $allowed = @('Scribe.exe', 'scribe-installer-candidate.json', 'PROVENANCE.json', 'DEPENDENCY-AUDIT.json')
            foreach ($entry in $entries) {
                $name = $entry.FullName
                # Exact flat names forbid traversal, ADS, separators, absolute paths and nested entries.
                if ($name -cmatch '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$') {
                    $installerCount += 1
                    $max = $script:MaxInstallerBytes
                } elseif ($name -cin $allowed) {
                    $max = if ($name -ceq 'Scribe.exe') { $script:MaxApplicationBytes } else { $script:MaxMetadataBytes }
                } else {
                    throw 'Archive has an unexpected or unsafe path'
                }
                if (-not $seen.Add($name) -or $entry.Length -le 0 -or
                    $entry.Length -gt $max -or $entry.CompressedLength -le 0 -or
                    ([double]$entry.Length / [double]$entry.CompressedLength) -gt 500) {
                    throw 'Archive has duplicate, empty, oversized or excessive-ratio entries'
                }
                $dosAttributes = $entry.ExternalAttributes -band 0xffff
                $unixMode = ($entry.ExternalAttributes -shr 16) -band 0xf000
                if (($dosAttributes -band 0x410) -ne 0 -or
                    ($unixMode -ne 0 -and $unixMode -ne 0x8000)) {
                    throw 'Archive contains a link, directory or non-regular file'
                }
                $total += $entry.Length
                if ($total -gt $script:MaxTotalExpandedBytes) {
                    throw 'Archive total expanded bytes exceed policy'
                }
            }
            if ($installerCount -ne 1 -or $seen.Count -ne 5) {
                throw 'Archive does not have the exact allowed file set'
            }
            New-Item -ItemType Directory -Path $DestinationRoot -ErrorAction Stop | Out-Null
            foreach ($entry in $entries) {
                $target = Join-Path $DestinationRoot $entry.FullName
                $sourceStream = $entry.Open()
                try {
                    $targetStream = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
                    try {
                        $buffer = [byte[]]::new(65536)
                        $written = [long]0
                        while (($read = $sourceStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                            $written += $read
                            if ($written -gt $entry.Length -or $written -gt $script:MaxTotalExpandedBytes) {
                                throw 'Archive expanded beyond its inspected entry size'
                            }
                            $targetStream.Write($buffer, 0, $read)
                        }
                        if ($written -ne $entry.Length) {
                            throw 'Extracted bytes differ from the approved entry size'
                        }
                    } finally { $targetStream.Dispose() }
                } finally { $sourceStream.Dispose() }
            }
        } finally { $zip.Dispose() }
    } finally { $input.Dispose() }
    [void](Get-AllowedInstallerFiles -Root $DestinationRoot)
}

function Get-PinnedAgeTools {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ToolRoot)
    if (Test-Path -LiteralPath $ToolRoot) { throw 'Refusing to reuse an age tool directory' }
    New-Item -ItemType Directory -Path $ToolRoot -ErrorAction Stop | Out-Null
    $archive = Join-Path $ToolRoot 'age-release.zip'
    $source = 'https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-windows-amd64.zip'
    Invoke-WebRequest -Uri $source -OutFile $archive -ErrorAction Stop
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $script:AgeArchiveSha256) {
        throw 'Pinned age release SHA-256 mismatch'
    }
    $unpacked = Join-Path $ToolRoot 'unpacked'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -ErrorAction Stop
    $age = @(Get-ChildItem -LiteralPath $unpacked -File -Recurse -Filter age.exe)
    $keygen = @(Get-ChildItem -LiteralPath $unpacked -File -Recurse -Filter age-keygen.exe)
    if ($age.Count -ne 1 -or $keygen.Count -ne 1 -or
        ($age[0].Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        ($keygen[0].Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Verified age archive has an unexpected executable layout'
    }
    return @{ Age = $age[0].FullName; Keygen = $keygen[0].FullName }
}

function Get-PinnedInstallerRecipient {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$RecipientFile)
    $value = (Get-Content -LiteralPath $RecipientFile -Raw -ErrorAction Stop).Trim()
    if ($value -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$') {
        throw 'Production recipient is not yet pinned or is invalid; no ciphertext may be published'
    }
    return $value
}

function Invoke-StrictAgeEncryption {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$AgeExe,
        [Parameter(Mandatory)][string]$Recipient,
        [Parameter(Mandatory)][string]$ArchivePath,
        [Parameter(Mandatory)][string]$CipherPath
    )
    if ($Recipient -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -or
        (Test-Path -LiteralPath $CipherPath)) {
        throw 'Invalid age recipient or existing ciphertext path'
    }
    & $AgeExe --encrypt --recipient $Recipient --output $CipherPath $ArchivePath
    if ($LASTEXITCODE -ne 0) { throw 'age encryption failed' }
    $cipher = Get-Item -LiteralPath $CipherPath -Force -ErrorAction Stop
    if ($cipher.PSIsContainer -or $cipher.Length -le 0 -or $cipher.Length -gt $script:MaxCipherBytes) {
        throw 'Encrypted payload is empty or oversized'
    }
}

function Invoke-StrictAgeDecryption {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$AgeExe,
        [Parameter(Mandatory)][string]$CipherPath,
        [Parameter(Mandatory)][string]$ArchivePath,
        [Parameter(Mandatory)][string]$IdentityRoot
    )
    if (-not $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY -or
        $env:WIN_INSTALLER_SMOKE_AGE_IDENTITY.Trim() -cnotmatch '^AGE-SECRET-KEY-1[0-9A-Z]{40,90}$') {
        throw 'Protected Environment decryption identity is missing or invalid'
    }
    $cipher = Get-Item -LiteralPath $CipherPath -Force -ErrorAction Stop
    if ($cipher.PSIsContainer -or
        ($cipher.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $cipher.Length -le 0 -or $cipher.Length -gt $script:MaxCipherBytes) {
        throw 'Downloaded ciphertext is invalid'
    }
    if (Test-Path -LiteralPath $ArchivePath) { throw 'Refusing to reuse decrypted archive output' }
    $identityFile = Join-Path $IdentityRoot ('age-identity-' + [guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($identityFile, ($env:WIN_INSTALLER_SMOKE_AGE_IDENTITY.Trim() + [Environment]::NewLine),
            [Text.UTF8Encoding]::new($false))
        & $AgeExe --decrypt --identity $identityFile --output $ArchivePath $CipherPath
        if ($LASTEXITCODE -ne 0) { throw 'age rejected ciphertext or the protected identity' }
        $decrypted = Get-Item -LiteralPath $ArchivePath -Force -ErrorAction Stop
        if ($decrypted.Length -le 0 -or $decrypted.Length -gt $script:MaxArchiveBytes) {
            throw 'Decrypted archive exceeds policy'
        }
    } finally {
        if (Test-Path -LiteralPath $identityFile) {
            Remove-Item -LiteralPath $identityFile -Force -ErrorAction Stop
        }
    }
}

Export-ModuleMember -Function Assert-EncryptedInstallerDispatch, Assert-TransferTempPath,
    Get-AllowedInstallerFiles, New-StrictInstallerArchive, Expand-StrictInstallerArchive,
    Get-PinnedAgeTools, Get-PinnedInstallerRecipient, Invoke-StrictAgeEncryption, Invoke-StrictAgeDecryption
