# Gate 8 overnight long run on Windows. See docs/plans/long-run-overnight.md.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\long-run\overnight-win.ps1 [-Hours 8] [-Smoke] [-Out <folder outside git>]
# Keeps the PC awake with SetThreadExecutionState (no admin; lasts while this window runs), mutes the
# speakers with the repo's Mute.exe (the capture records before the volume), records a generated 880 Hz tone
# on the meeting track and the default mic, then checks the result.
# Stop early and safely: create a file named STOP in the evidence folder, or press Ctrl+C once.
param([double]$Hours = 8, [switch]$Smoke, [string]$Out = '')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$native = Join-Path $repo 'native\windows-capture'
$helper = Join-Path $native 'build\bin\scrb-capture.exe'
$mute = Join-Path $native 'tools\windows-mute\Mute.exe'
$tone = Join-Path $native 'tools\windows-tone-player\TonePlayer.exe'
foreach ($file in @($helper, $mute, $tone)) { if (-not (Test-Path $file)) { throw "missing $file : build native\windows-capture first (build.cmd)" } }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'node is not on PATH' }
if (-not $Out) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $Out = Join-Path $env:LOCALAPPDATA ('scrb-long-run\' + $(if ($Smoke) { 'smoke-' } else { '' }) + $stamp)
}
if ($Out.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'the evidence folder must be outside the repo' }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$seconds = [int]($Hours * 3600)
$arguments = @('--experimental-transform-types', (Join-Path $repo 'scripts\long-run\overnight.mjs'), '--helper', $helper, '--tone-player', $tone, '--work', $Out)
if ($Smoke) { $arguments += @('--smoke') } else { $arguments += @('--seconds', $seconds, '--sample-seconds', 60) }

Add-Type -Namespace Scrb -Name Awake -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
[void][Scrb.Awake]::SetThreadExecutionState(0x80000003)
$wasMuted = (& $mute status) -match 'muted=1'
Write-Host "helper:   $helper"
Write-Host "evidence: $Out"
Write-Host "stop early: New-Item '$Out\STOP'   (or Ctrl+C once)"
try {
  & $mute on
  & $node.Source @arguments
  $code = $LASTEXITCODE
} finally {
  if (-not $wasMuted) { & $mute off }
  [void][Scrb.Awake]::SetThreadExecutionState(0x80000000)
}
exit $code
