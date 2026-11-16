# Gate 8 overnight long run on Windows. See docs/plans/long-run-overnight.md.
# Default is a 5-minute smoke. Anything longer needs an explicit -Hours (and the owner's approval).
# The evidence folder must be new or empty and outside the repo; the driver checks that before anything starts.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\long-run\overnight-win.ps1 [-Hours N] [-Out <folder outside git>]
# Optional: set SCRB_NODE_EXE to an absolute Node executable path to bypass PATH lookup.
# Keeps the PC awake with SetThreadExecutionState (no admin; lasts while this window runs), mutes the
# speakers with the repo's Mute.exe (the capture records before the volume), records a generated 880 Hz tone
# on the meeting track and the default mic, then checks the result.
# Stop early and safely: create a file named STOP in the evidence folder, or press Ctrl+C once.
param([double]$Hours = 0, [switch]$Smoke, [string]$Out = '')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$native = Join-Path $repo 'native\windows-capture'
$helper = Join-Path $native 'build\bin\scrb-capture.exe'
$mute = Join-Path $native 'tools\windows-mute\Mute.exe'
$tone = Join-Path $native 'tools\windows-tone-player\TonePlayer.exe'
foreach ($file in @($helper, $mute, $tone)) { if (-not (Test-Path $file)) { throw "missing $file : build native\windows-capture first (build.cmd)" } }
if (Test-Path Env:\SCRB_NODE_EXE) {
  $nodeOverride = [Environment]::GetEnvironmentVariable('SCRB_NODE_EXE', 'Process')
  $isAbsolute = ($nodeOverride -match '^[A-Za-z]:\\') -or $nodeOverride.StartsWith('\\')
  if (-not $isAbsolute) { throw 'SCRB_NODE_EXE must be an absolute path to node.exe' }
  if ([System.IO.Path]::GetExtension($nodeOverride) -ine '.exe') { throw 'SCRB_NODE_EXE must point to node.exe' }
  if (-not (Test-Path -LiteralPath $nodeOverride -PathType Leaf)) { throw "SCRB_NODE_EXE does not exist: $nodeOverride" }
  $nodePath = (Resolve-Path -LiteralPath $nodeOverride).Path
  $node = Get-Command -Name $nodePath -CommandType Application -ErrorAction Stop
} else {
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) { throw 'node is not on PATH' }
$nodeExe = $node.Source
if (-not $nodeExe) { throw 'selected node command has no executable path' }
$nodeVersion = & $nodeExe --version
$nodeVersionExit = $LASTEXITCODE
if ($nodeVersionExit -ne 0) { throw "selected node failed --version (exit $nodeVersionExit): $nodeExe" }
$nodeVersion = ($nodeVersion -join ' ').Trim()
if (-not $nodeVersion) { throw "selected node returned no version: $nodeExe" }
Write-Host "node: $nodeExe ($nodeVersion)"
if (-not $Out) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $Out = Join-Path $env:LOCALAPPDATA ('scrb-long-run\' + $(if ($Hours -le 0) { 'smoke-' } else { '' }) + $stamp)
}
$seconds = if ($Hours -gt 0 -and -not $Smoke) { [int]($Hours * 3600) } else { 300 }
$arguments = @('--experimental-transform-types', (Join-Path $repo 'scripts\long-run\overnight.mjs'), '--helper', $helper, '--tone-player', $tone, '--work', $Out)
$arguments += @('--seconds', $seconds)

Add-Type -Namespace Scrb -Name Awake -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
# Windows PowerShell 5.1 parses 0x80000003 as a negative Int32, which cannot convert to uint; pass uint32 literals.
[void][Scrb.Awake]::SetThreadExecutionState([uint32]2147483651)
$wasMuted = (& $mute status) -match 'muted=1'
Write-Host "helper:   $helper"
Write-Host "evidence: $Out"
Write-Host "stop early: New-Item '$Out\STOP'   (or Ctrl+C once)"
try {
  & $mute on
  & $nodeExe @arguments
  $code = $LASTEXITCODE
} finally {
  if (-not $wasMuted) { & $mute off }
  [void][Scrb.Awake]::SetThreadExecutionState([uint32]2147483648)
}
exit $code
