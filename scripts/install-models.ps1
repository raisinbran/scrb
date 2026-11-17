# This source template is stamped with the repository digest manifest's SHA-256 by stage-win-models.mjs.
# Run the staged copy from the portable handover folder (PowerShell 5.1+, no administrator rights).
param(
    [string]$Destination,
    [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expectedManifestSha256 = '@@MODEL_DIGESTS_SHA256@@'
$required = @(
    'ggml-large-v3-turbo-q5_0.bin',
    'ggml-small.en-q5_1.bin',
    'ggml-silero-v6.2.0.bin',
    '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
    'segmentation-model.int8.onnx'
)

function Assert-File($file) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing required file: $file" }
    $item = Get-Item -LiteralPath $file -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing linked file: $file"
    }
    return $item
}

function Assert-Models($folder, $digests) {
    foreach ($name in $required) {
        $file = Join-Path $folder $name
        $item = Assert-File $file
        $pin = $digests.PSObject.Properties[$name]
        if ($null -eq $pin) { throw "Missing pinned digest: $name" }
        $value = $pin.Value
        if ($null -eq $value.sha256 -or $value.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
            $value.bytes -isnot [long] -and $value.bytes -isnot [int]) {
            throw "Invalid digest entry: $name"
        }
        if ($item.Length -ne [long]$value.bytes) { throw "Size mismatch: $name" }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -cne $value.sha256) { throw "SHA-256 mismatch: $name" }
    }
}

$manifestPath = Join-Path $PSScriptRoot 'model-digests.json'
$manifestFile = Assert-File $manifestPath
$actualManifestSha256 = (Get-FileHash -LiteralPath $manifestFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualManifestSha256 -cne $expectedManifestSha256) {
    throw 'Handover manifest SHA-256 mismatch; refusing installation'
}
$digests = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$source = Join-Path $PSScriptRoot 'models'
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Missing handover models folder: $source"
}
$sourceItem = Get-Item -LiteralPath $source -Force
if (($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Refusing linked models folder'
}
$extras = @(Get-ChildItem -LiteralPath $source -Force | Where-Object { $required -cnotcontains $_.Name })
if ($extras.Count -gt 0) { throw 'Unexpected entries in handover models folder' }
Assert-Models $source $digests
if ($VerifyOnly) {
    Write-Host 'Handover integrity verified (five speech models)'
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Destination)) {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw 'LOCALAPPDATA is unavailable' }
    $Destination = Join-Path $env:LOCALAPPDATA 'Scribe\models'
}
$Destination = [IO.Path]::GetFullPath($Destination)
# Preserve any existing valid installation byte-for-byte; never overwrite an invalid or partial one.
if (Test-Path -LiteralPath $Destination) {
    $item = Get-Item -LiteralPath $Destination -Force
    if (-not $item.PSIsContainer -or
        ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing non-directory or linked installation target: $Destination"
    }
    Assert-Models $Destination $digests
    Write-Host "Already installed and verified: $Destination"
    exit 0
}

$parent = Split-Path -Parent $Destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$pending = Join-Path $parent ('.scribe-models-staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $pending -ErrorAction Stop | Out-Null
try {
    foreach ($name in $required) {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $pending $name) -ErrorAction Stop
    }
    Assert-Models $pending $digests
    # Same-volume directory rename is atomic and fails rather than merging with a concurrent target.
    [IO.Directory]::Move($pending, $Destination)
    Write-Host "Installed five speech models: $Destination"
} finally {
    if (Test-Path -LiteralPath $pending) {
        Remove-Item -LiteralPath $pending -Recurse -Force -ErrorAction SilentlyContinue
    }
}
