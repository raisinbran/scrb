# Build a per-user NSIS installer from an already verified seven-tool Windows package.
# This script does not install or launch the application.
param(
    [Parameter(Mandatory = $true)]
    [string]$StagingDirectory,

    [Parameter(Mandatory = $true)]
    [string]$PrepackagedDirectory,

    [string]$BuilderCli
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repo 'apps\desktop'
$outputFolder = "release-installer-build-$([guid]::NewGuid().ToString('N'))"
$outputDir = Join-Path $appDir $outputFolder
$staging = [IO.Path]::GetFullPath($StagingDirectory)
$prepackaged = [IO.Path]::GetFullPath($PrepackagedDirectory)
$output = [IO.Path]::GetFullPath($outputDir)

if (-not (Test-Path -LiteralPath $staging -PathType Container)) {
    throw "Verified Windows staging directory is missing: $staging"
}
if (-not (Test-Path -LiteralPath $prepackaged -PathType Container)) {
    throw "Prepackaged Windows app directory is missing: $prepackaged"
}
if (-not (Test-Path -LiteralPath (Join-Path $prepackaged 'Scribe.exe') -PathType Leaf)) {
    throw 'Prepackaged directory does not contain Scribe.exe'
}
if ($prepackaged.StartsWith($output + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Prepackaged input must be outside release-installer output'
}
if (Test-Path -LiteralPath $output) {
    throw "Refusing to reuse pre-existing installer output directory: $output"
}
New-Item -ItemType Directory -Path $output -ErrorAction Stop | Out-Null

$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v22\.') {
    throw "Node 22 is required to build the Windows installer; found $nodeVersion"
}

$verify = Join-Path $repo 'scripts\verify-win-package.mjs'
& node $verify --staging $staging --packaged (Join-Path $prepackaged 'resources\bin') --slice 3
if ($LASTEXITCODE -ne 0) { throw 'Seven-tool prepackaged input failed verification' }

if ($BuilderCli) {
    $BuilderCli = [IO.Path]::GetFullPath($BuilderCli)
}
if (-not $BuilderCli) {
    Push-Location $appDir
    try {
        $BuilderCli = (& node -e "console.log(require.resolve('electron-builder/cli.js'))").Trim()
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $BuilderCli -PathType Leaf)) {
            throw 'electron-builder is not installed; run npm install in the scrb folder first'
        }
    } finally {
        Pop-Location
    }
}
if (-not (Test-Path -LiteralPath $BuilderCli -PathType Leaf)) {
    throw "electron-builder CLI is missing: $BuilderCli"
}

Push-Location $appDir
try {
    & node $BuilderCli --win nsis --x64 --publish never --prepackaged $prepackaged "--config.directories.output=$outputFolder"
    if ($LASTEXITCODE -ne 0) { throw 'electron-builder NSIS packaging failed' }
} finally {
    Pop-Location
}

$package = Get-Content -LiteralPath (Join-Path $appDir 'package.json') -Raw | ConvertFrom-Json
$installer = Join-Path $output ("Scribe Setup {0}.exe" -f $package.version)
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "electron-builder did not produce the expected NSIS installer: $installer"
}
$sourceCommit = (& git -C $repo rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[a-fA-F0-9]{40}
) {
    throw 'Cannot identify the exact source commit for installer candidate'
}
$candidateManifest = Join-Path $output 'scribe-installer-candidate.json'
& node (Join-Path $repo 'scripts\win-installer-candidate-manifest.mjs') create `
    --installer $installer `
    --application (Join-Path $prepackaged 'Scribe.exe') `
    --provenance (Join-Path $staging 'PROVENANCE.json') `
    --audit (Join-Path $staging 'DEPENDENCY-AUDIT.json') `
    --commit $sourceCommit `
    --manifest $candidateManifest
if ($LASTEXITCODE -ne 0) { throw 'Installer candidate integrity manifest generation failed' }
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "NSIS installer: $installer"
Write-Host "SHA-256: $hash"
Write-Host "Candidate integrity manifest: $candidateManifest"
