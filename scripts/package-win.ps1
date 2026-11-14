# Builds the unpacked Windows app: apps\desktop\release\win-unpacked\Scribe.exe (slice 1).
#
# Run in PowerShell (not as administrator) from the scrb folder on a Windows 11 PC with Node.
# No tools are staged yet, so the bundle's resources\bin is empty and Scribe reports the
# missing tools instead of recording. Library, settings and models are never touched.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repo 'apps\desktop')

# win.extraResources copies this folder to resources\bin; slice 2 fills it.
New-Item -ItemType Directory -Force -Path 'build\win-stage\bin' | Out-Null

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
Write-Host "Built: $exe"
