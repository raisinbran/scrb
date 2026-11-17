# Builds the unpacked Windows app: apps\desktop\release\win-unpacked\Scribe.exe.
#
# Run in PowerShell (not as administrator) from the scrb folder on a Windows 11 PC with Node.
param(
    [ValidateSet('1', '2', '3')]
    [string]$Slice = '1'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repo 'apps\desktop')

$stageBin = Join-Path $PWD 'build\win-stage\bin'
if ($Slice -eq '1') {
    # Slice 1 intentionally builds the shell without runtime tools.
    New-Item -ItemType Directory -Force -Path $stageBin | Out-Null
} elseif (-not (Test-Path -LiteralPath $stageBin -PathType Container)) {
    throw "Slice $Slice requires staged runtime tools at $stageBin. Run scripts\stage-win-tools.mjs first."
}

npm run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
if (Test-Path 'release') { Remove-Item -Recurse -Force 'release' }
# Run electron-builder's own script with node, not through npx: npx refuses (EUSAGE) when this
# script is started from a launcher that passes npm options, and it needs no network here.
$cli = (node -e "console.log(require.resolve('electron-builder/cli.js'))").Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $cli)) { throw 'electron-builder is not installed: run npm install in the scrb folder first' }
node $cli --win dir --x64 --publish never
if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }

$exe = Join-Path $PWD 'release\win-unpacked\Scribe.exe'
if (-not (Test-Path $exe)) { throw "Build did not produce $exe" }
if ($Slice -in @('2', '3')) {
    $packagedBin = Join-Path $PWD 'release\win-unpacked\resources\bin'
    node (Join-Path $repo 'scripts\verify-win-package.mjs') --staging $stageBin --packaged $packagedBin --slice $Slice
    if ($LASTEXITCODE -ne 0) { throw "Packaged slice $Slice runtime verification failed" }
}
Write-Host "Built: $exe"
