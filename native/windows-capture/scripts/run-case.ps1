# Derived from phase0/scripts/run-windows-device-case.ps1, which hardcodes
# DualCapture: same tone target and output mute, driving scrb-capture instead.
# -Script holds "<seconds>=<json command>" entries, sent at that time after start.
# A command of "kill" force-kills the helper; "killtone" ends the target app;
# "restartaudio" restarts Windows Audio through an elevation prompt.
# -Actions holds "<seconds>=<what the owner does>", shown in a countdown window.
# With -Actions the run waits -LeadSeconds so the owner can read the first step.
param(
    [Parameter(Mandatory)][string]$Case,
    [int]$Seconds = 60,
    [string[]]$Script = @(),
    [string[]]$Actions = @(),
    [int]$LeadSeconds = 20,
    [string]$HelperArgs = '--test-hooks',
    [string]$Mic = 'default',
    [switch]$WholeComputer,
    # Target a parent shell that outlives the tone and starts it again, as a
    # real app outlives a lost stream.  TonePlayer exits when Windows Audio
    # restarts.
    [switch]$TreeTarget
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$repo = Resolve-Path (Join-Path $root '..\..')
$bin = Join-Path $root 'build\bin'
$out = Join-Path $root "out\$Case"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null
$results = Join-Path $root 'results'
$mute = Join-Path $repo 'phase0\probes\windows-mute\Mute.exe'
$tonePlayer = Join-Path $repo 'phase0\probes\windows-tone-player\TonePlayer.exe'
& $mute on | Out-Null

$tone = if ($TreeTarget) {
    Start-Process cmd.exe -ArgumentList '/k', "for /l %i in (1,1,9) do (@`"$tonePlayer`" 880 $($Seconds + 60) 1 & ping -n 3 127.0.0.1 >nul)" -PassThru -WindowStyle Hidden
} else {
    Start-Process $tonePlayer -ArgumentList 880, ($Seconds + 60), 1 -PassThru -WindowStyle Hidden
}
Start-Sleep -Seconds 2
if ($Actions.Count) {
    # Encoded so quotes in an action survive the command line.
    $startAt = (Get-Date).AddSeconds($LeadSeconds + 1)
    $call = "& '$PSScriptRoot\countdown.ps1' -Case '$Case' -StartAt ([datetime]'$($startAt.ToString('o'))') -Seconds $Seconds -Actions @($(($Actions | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ','))"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($call))
    # CreateNoWindow, not -WindowStyle Hidden, which also hides the form.
    $cd = [System.Diagnostics.ProcessStartInfo]::new('powershell.exe', "-NoProfile -Sta -EncodedCommand $encoded")
    $cd.UseShellExecute = $false
    $cd.CreateNoWindow = $true
    [void][System.Diagnostics.Process]::Start($cd)
    while ((Get-Date) -lt $startAt.AddSeconds(-1)) { Start-Sleep -Milliseconds 100 }
}
$events = Join-Path $out 'events.jsonl'
$psi = [System.Diagnostics.ProcessStartInfo]::new('cmd.exe')
$psi.Arguments = "/c `"`"$bin\scrb-capture.exe`" $HelperArgs > `"$events`" 2> `"$out\stderr.txt`"`""
$psi.RedirectStandardInput = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$p = [System.Diagnostics.Process]::Start($psi)
$id = 0
function Send([string]$json) {
    $script:id++
    $line = $json -replace '^\{', "{`"id`":$($script:id),"
    $p.StandardInput.WriteLine($line)
    $p.StandardInput.Flush()
}
$pidField = if ($WholeComputer) { 0 } else { $tone.Id }
$dir = $out -replace '\\', '\\'
Send "{`"cmd`":`"open`",`"sessionId`":`"session`",`"outputDir`":`"$dir`",`"pid`":$pidField,`"mic`":`"$Mic`"}"
Start-Sleep -Milliseconds 800
Send '{"cmd":"start"}'
$start = Get-Date
"case=$Case start=$($start.ToString('HH:mm:ss')) tonePid=$($tone.Id)"
$steps = @($Script | ForEach-Object { $k, $v = $_ -split '=', 2; [pscustomobject]@{ At = [double]$k; Cmd = $v } } | Sort-Object At)
$killed = $false
foreach ($s in $steps) {
    while (((Get-Date) - $start).TotalSeconds -lt $s.At) { Start-Sleep -Milliseconds 100 }
    "$((Get-Date).ToString('HH:mm:ss')) +$($s.At)s $($s.Cmd)"
    if ($s.Cmd -eq 'kill') { Stop-Process -Name scrb-capture -Force; $killed = $true; break }
    elseif ($s.Cmd -eq 'killtone') { $tone.Kill() }
    elseif ($s.Cmd -eq 'killplayer') { Stop-Process -Name TonePlayer -Force }
    elseif ($s.Cmd -eq 'players') { "players: $(@(Get-Process TonePlayer -ErrorAction SilentlyContinue).Id -join ',')" }
    elseif ($s.Cmd -eq 'restartaudio') { Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', 'Restart-Service Audiosrv -Force' }
    else { Send $s.Cmd }
}
while (-not $killed -and ((Get-Date) - $start).TotalSeconds -lt $Seconds) { & $mute on | Out-Null; Start-Sleep 2 }
if (-not $killed) { Send '{"cmd":"quit"}' }
$p.StandardInput.Close()
if (-not $p.WaitForExit(20000)) { 'HUNG; killing'; Stop-Process -Name scrb-capture -Force }
try { $tone.Kill() } catch {}
if ($TreeTarget) { Stop-Process -Name TonePlayer -Force -ErrorAction SilentlyContinue }

$verify = & "$bin\ChunkVerify.exe" "$out\session"
$names = Get-Content $events | ForEach-Object { if ($_ -match '"event":"([^"]+)"') { $Matches[1] } } | Where-Object { $_ -notin 'health', 'chunkClosed' }
$counts = ($names | Group-Object | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' '
$report = @("case=$Case helperExit=$($p.ExitCode)", $verify, "events: $counts") + (Get-Content "$out\stderr.txt" -ErrorAction SilentlyContinue)
$report | Set-Content (Join-Path $results "$Case.txt")
$report
