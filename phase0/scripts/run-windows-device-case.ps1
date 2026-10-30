param([Parameter(Mandatory)][string]$Case, [int]$Seconds = 300)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot ..)
New-Item -ItemType Directory -Force artifacts\capture\devices | Out-Null
$prefix = "artifacts\capture\devices\$Case"
$tone = Start-Process probes\windows-tone-player\TonePlayer.exe -ArgumentList 880, ($Seconds + 100), 1 -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 500
$start = Get-Date
"case=$Case start=$($start.ToString('HH:mm:ss')) actionAt=$($start.AddSeconds(60).ToString('HH:mm:ss')) tonePid=$($tone.Id)"
$p = Start-Process probes\windows-dual-capture\DualCapture.exe -ArgumentList $tone.Id, $prefix, $Seconds `
    -RedirectStandardOutput "$prefix.stdout.txt" -RedirectStandardError "$prefix.stderr.txt" -PassThru -NoNewWindow
$null = $p.Handle  # keep the handle so ExitCode is readable
$mute = 'probes\windows-mute\Mute.exe'
$deadline = (Get-Date).AddSeconds($Seconds + 90); $lastDev = ''
while (-not $p.HasExited -and (Get-Date) -lt $deadline) {
    $st = & $mute on
    if ($st -ne $lastDev) { "$((Get-Date).ToString('HH:mm:ss')) output: $st"; $lastDev = $st }
    Start-Sleep 2
}
$exited = $p.WaitForExit(1000)
if (-not $exited) { "HUNG after $($Seconds + 90)s; killing"; $p.Kill(); $p.WaitForExit() }
"exited=$exited exit=$($p.ExitCode) end=$((Get-Date).ToString('HH:mm:ss')) elapsed=$([int]((Get-Date) - $start).TotalSeconds)s"
try { $tone.Kill() } catch {}
"--- stderr"; Get-Content "$prefix.stderr.txt" -ErrorAction SilentlyContinue
"--- stdout (tail)"; Get-Content "$prefix.stdout.txt" -Tail 15 -ErrorAction SilentlyContinue
"--- summary"; Get-Content "$prefix-summary.json" -ErrorAction SilentlyContinue

