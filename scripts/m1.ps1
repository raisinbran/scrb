# Starts the desktop app in real mode (dev build) on Windows: real recording, live text and final pass.
# Windows counterpart of scripts/m1.sh. Fails before launching if anything the real mode needs
# is missing, so the app never falls back to the mock without the owner noticing.
#
# Run in PowerShell (not as administrator) from any folder: powershell -File scripts\m1.ps1
# SCRB_M1_HOME replaces the user profile folder as the place that holds scrb-dev-assets (tests only).
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$home1 = if ($env:SCRB_M1_HOME) { $env:SCRB_M1_HOME } else { $env:USERPROFILE }
$assets = Join-Path $home1 'scrb-dev-assets\config'
$helperRel = 'native\windows-capture\build\bin\scrb-capture.exe'

$helper = Join-Path $repo $helperRel
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
  # A worktree has no build folder; the main checkout, the parent of the shared .git, does.
  $common = $null
  try {
    $ErrorActionPreference = 'Continue'
    $common = (& git -C $repo rev-parse --path-format=absolute --git-common-dir 2>$null)
    if ($LASTEXITCODE -ne 0) { $common = $null }
  } catch { $common = $null } finally { $ErrorActionPreference = 'Stop' }
  if ($common) {
    $main = Split-Path -Parent ([string]$common -replace '/', '\')
    $candidate = Join-Path $main $helperRel
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $helper = $candidate }
  }
}
$live = Join-Path $assets 'live.json'
$final = Join-Path $assets 'final-pass.json'

$missing = New-Object System.Collections.Generic.List[string]
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
  $missing.Add("capture helper: $helper (build it: see docs\plans\windows-m1-run.md, step 3)")
}
if (-not (Test-Path -LiteralPath $live -PathType Leaf)) { $missing.Add("live config: $live") }
if (-not (Test-Path -LiteralPath $final -PathType Leaf)) { $missing.Add("final-pass config: $final") }

# Keys the app requires (backend.ts readLiveSetup; app-core final-pass.ts loadSetup; ffprobe for imports).
$liveKeys = 'tools.whisperServer', 'tools.whisperVad', 'models.speechLive', 'models.vad'
$finalKeys = 'tools.ffmpeg', 'tools.ffprobe', 'tools.whisperCli', 'tools.sherpaSidecar',
  'models.speechFinal', 'models.vad', 'models.segmentation', 'models.embedding'

function Get-ConfigProblems([string]$Config, [string[]]$Keys) {
  try { $c = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { return @('is not valid JSON') }
  if ($null -eq $c) { return @('is not valid JSON') }
  $out = @()
  foreach ($key in $Keys) {
    $group, $name = $key.Split('.')
    $section = $c.$group
    $v = if ($null -ne $section) { $section.$name } else { $null }
    if ($v -isnot [string] -or $v -eq '') { $out += "lacks a non-empty `"$key`"" }
    elseif (-not (Test-Path -LiteralPath $v -PathType Leaf)) { $out += "`"$key`" points to a missing file: $v" }
  }
  return $out
}
function Test-Config([string]$Label, [string]$Config, [string[]]$Keys) {
  if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) { return }
  foreach ($p in (Get-ConfigProblems $Config $Keys)) { $missing.Add("$Label $p (in $Config)") }
}
Test-Config 'live config' $live $liveKeys
Test-Config 'final-pass config' $final $finalKeys
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $missing.Add('node (install Node 22.12 or newer and reopen PowerShell)')
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { $missing.Add('npm (comes with Node)') }
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules\electron\dist\electron.exe'))) {
  $missing.Add("electron: $(Join-Path $repo 'node_modules\electron\dist\electron.exe') (run: npm install)")
}
if ($missing.Count -gt 0) {
  Write-Host 'Cannot start real mode. Missing:'
  foreach ($m in $missing) { Write-Host "  - $m" }
  exit 1
}

# The app allows one running copy. A second launch hands over to the old one and quits, so a
# copy left running from before a pull would silently show old code. Refuse instead.
# Only this checkout's dev app counts (its own node_modules\electron), never other apps or repos.
$electronMain = Join-Path $repo 'node_modules\electron\dist\electron.exe'
# Both discovery methods return objects shaped ProcessId, ExecutablePath, CommandLine, HasWindow.
function Get-ElectronViaCim {
  if ($env:SCRB_M1_FORCE_CIM_FAIL) { throw 'Access denied (forced by test)' }  # tests only
  Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction Stop | ForEach-Object {
    [pscustomobject]@{ ProcessId = $_.ProcessId; ExecutablePath = $_.ExecutablePath; CommandLine = $_.CommandLine; HasWindow = $null }
  }
}
function Get-ElectronViaProcess {  # no command line is available here
  if ($env:SCRB_M1_FALLBACK_LIST) {  # tests only: lines "pid|exe path (may be empty)|1 if it owns a window"
    foreach ($line in (Get-Content -LiteralPath $env:SCRB_M1_FALLBACK_LIST)) {
      $f = $line.Split('|', 3)
      if ($f.Count -eq 3) {
        [pscustomobject]@{ ProcessId = [int]$f[0]; ExecutablePath = $f[1]; CommandLine = $null; HasWindow = ($f[2] -eq '1') }
      }
    }
    return
  }
  Get-Process -Name electron -ErrorAction SilentlyContinue | ForEach-Object {
    $path = $null
    try { $path = $_.Path } catch { $path = $null }
    [pscustomobject]@{ ProcessId = $_.Id; ExecutablePath = $path; CommandLine = $null; HasWindow = ($_.MainWindowHandle -ne 0) }
  }
}

$running = @()
$skipCheck = $false
if ($env:SCRB_M1_PROCESS_LIST) {  # tests only: lines "pid|exe path|command line"
  $procs = foreach ($line in (Get-Content -LiteralPath $env:SCRB_M1_PROCESS_LIST)) {
    $f = $line.Split('|', 3)
    if ($f.Count -eq 3) { [pscustomobject]@{ ProcessId = $f[0]; ExecutablePath = $f[1]; CommandLine = $f[2] } }
  }
  $running = @($procs | Where-Object {
      $_.ExecutablePath -and ($_.ExecutablePath -ieq $electronMain) -and ($_.CommandLine -notmatch '--type=')
    })
} else {
  $cimProcs = $null
  try { $cimProcs = @(Get-ElectronViaCim) } catch { $cimProcs = $null }
  if ($null -ne $cimProcs) {
    $running = @($cimProcs | Where-Object {
        $_.ExecutablePath -and ($_.ExecutablePath -ieq $electronMain) -and ($_.CommandLine -notmatch '--type=')
      })
  } else {
    # The process query was refused. Without a command line, a path match alone could be a GPU or
    # renderer subprocess, so count only a process that owns a window (Electron's main process does).
    $fallback = @(Get-ElectronViaProcess)
    $unreadable = @($fallback | Where-Object { -not $_.ExecutablePath })
    $ours = @($fallback | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $electronMain) })
    $running = @($ours | Where-Object { $_.HasWindow })
    if ($running.Count -eq 0 -and ($unreadable.Count -gt 0 -or $ours.Count -gt 0)) { $skipCheck = $true }
  }
}
if ($running.Count -gt 0) {
  Write-Host 'Scribe is already running, so a new start would just reopen the old copy.'
  Write-Host 'Quit it first: close the Scribe window (the X, or File > Quit), then run this again.'
  Write-Host "If it will not quit, run: Stop-Process -Id $($running[0].ProcessId) -Force"
  exit 1
}
if ($skipCheck) { Write-Host 'Skipped the check for a running copy of Scribe (process details could not be read); starting anyway.' }

$env:SCRB_CAPTURE_HELPER = $helper
$env:SCRB_LIVE_CONFIG = $live
$env:SCRB_FINAL_PASS_CONFIG = $final
Set-Location $repo
& npm start -w '@scrb/desktop'
exit $LASTEXITCODE
