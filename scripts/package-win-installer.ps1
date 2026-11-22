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
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[a-fA-F0-9]{40}$') {
    throw 'Cannot identify the exact source commit for installer candidate'
}
$candidateManifest = Join-Path $output 'scribe-installer-candidate.json'
$candidateScript = Join-Path $repo 'scripts\win-installer-candidate-manifest.mjs'
$candidateArgs = @(
    $candidateScript, 'create',
    '--installer', $installer,
    '--application', (Join-Path $prepackaged 'Scribe.exe'),
    '--provenance', (Join-Path $staging 'PROVENANCE.json'),
    '--audit', (Join-Path $staging 'DEPENDENCY-AUDIT.json'),
    '--commit', $sourceCommit,
    '--manifest', $candidateManifest
)
& node @candidateArgs
if ($LASTEXITCODE -ne 0) { throw 'Installer candidate integrity manifest generation failed' }
# On an independently trusted hosted producer job ONLY, publish the digest evidence
# through GITHUB_OUTPUT (a job-output channel), NOT inside the downloadable artifact.
# The consumer must receive needs.verified-installer-producer.outputs.* from its
# protected workflow. Do not promote these values from an artifact JSON.
if ($env:GITHUB_ACTIONS -eq 'true') {
    if ($env:GITHUB_JOB -cne 'verified-installer-producer' -or
        $env:GITHUB_REPOSITORY -cne 'raisinbran/scrb' -or
        $env:GITHUB_SHA -cne $sourceCommit -or
        $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
        $env:GITHUB_RUN_ID -notmatch '^[0-9]+
Write-Host "NSIS installer: $installer"
Write-Host "SHA-256: $hash"
Write-Host "Candidate integrity manifest: $candidateManifest"
 -or
        $env:GITHUB_RUN_ATTEMPT -notmatch '^[1-9][0-9]*
Write-Host "NSIS installer: $installer"
Write-Host "SHA-256: $hash"
Write-Host "Candidate integrity manifest: $candidateManifest"
 -or
        [string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) {
        throw 'Trusted hosted installer producer source and output channel are unavailable'
    }
    # Reverify the seven-tool stage and prepackaged DLL/license closure immediately
    # before issuing attestations. The candidate manifest already binds these files.
    & node $verify --staging $staging --packaged (Join-Path $prepackaged 'resources\bin') --slice 3
    if ($LASTEXITCODE -ne 0) { throw 'Trusted producer stage revalidation failed' }
    $candidate = Get-Content -LiteralPath $candidateManifest -Raw | ConvertFrom-Json
    $provenanceSha = (Get-FileHash -LiteralPath (Join-Path $staging 'PROVENANCE.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    $auditSha = (Get-FileHash -LiteralPath (Join-Path $staging 'DEPENDENCY-AUDIT.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($candidate.sourceCommit -cne $sourceCommit -or
        $candidate.provenance.sha256 -cne $provenanceSha -or
        $candidate.dependencyAudit.sha256 -cne $auditSha) {
        throw 'Trusted producer manifest differs from the revalidated stage or source'
    }
    $manifestSha = (Get-FileHash -LiteralPath $candidateManifest -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidence = @(
        "manifest_sha256=$manifestSha",
        "source_commit=$sourceCommit",
        "provenance_sha256=$provenanceSha",
        "dependency_audit_sha256=$auditSha",
        "producer_run_id=$($env:GITHUB_RUN_ID)",
        "producer_run_attempt=$($env:GITHUB_RUN_ATTEMPT)"
    )
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value $evidence -Encoding utf8
}
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "NSIS installer: $installer"
Write-Host "SHA-256: $hash"
Write-Host "Candidate integrity manifest: $candidateManifest"
