param(
    [int]$DurationSeconds = 3600,
    [int]$KillEverySeconds = 30,
    [string]$Name = 'stress-60min'
)

# Captures a tone process and the mic with DualCapture.exe while repeatedly
# starting a CPU whisper.cpp large-v3-turbo transcription and force-killing it
# mid-run.  Afterwards the capture summary shows whether heavy AI load or worker
# crashes caused discontinuities or packet starvation.

$ErrorActionPreference = 'Stop'
$scratch = Split-Path -Parent $PSScriptRoot
$out = Join-Path $scratch 'artifacts\capture\dualprobe'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$probe = Join-Path $scratch 'probes\windows-dual-capture\DualCapture.exe'
$tone = Join-Path $scratch 'probes\windows-tone-player\TonePlayer.exe'
$whisper = Join-Path $scratch 'upstream\whisper.cpp\build-cpu\bin\whisper-cli.exe'
$model = Join-Path $scratch 'models\whisper\ggml-large-v3-turbo-q5_0.bin'
$sample = Join-Path $scratch 'upstream\whisper.cpp\samples\jfk.wav'

$toneProcess = Start-Process $tone -ArgumentList "880 $($DurationSeconds + 20) 1" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
$capture = Start-Process $probe -ArgumentList "$($toneProcess.Id) `"$out\$Name`" $DurationSeconds" `
    -RedirectStandardOutput "$out\$Name.stdout.txt" -RedirectStandardError "$out\$Name.stderr.txt" `
    -PassThru -WindowStyle Hidden

$log = [System.Collections.Generic.List[object]]::new()
$started = Get-Date
while (-not $capture.HasExited) {
    $worker = Start-Process $whisper -ArgumentList "-m `"$model`" -f `"$sample`" -t 20 -nt" `
        -RedirectStandardOutput "$out\$Name-worker.stdout.txt" -RedirectStandardError "$out\$Name-worker.stderr.txt" `
        -PassThru -WindowStyle Hidden
    $lifetime = Get-Random -Minimum 2 -Maximum ([Math]::Max(3, $KillEverySeconds - 2))
    Start-Sleep -Seconds $lifetime
    $state = 'completed'
    if (-not $worker.HasExited) {
        Stop-Process -Id $worker.Id -Force
        $state = 'killed'
    }
    $worker.WaitForExit()
    $log.Add([pscustomobject]@{
        at_s = [Math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        lifetime_s = $lifetime
        state = $state
        exit_code = $worker.ExitCode
    })
    Start-Sleep -Seconds ([Math]::Max(0, $KillEverySeconds - $lifetime))
}
$capture.WaitForExit()
if (-not $toneProcess.HasExited) { Stop-Process -Id $toneProcess.Id -Force }

$log | ConvertTo-Json | Set-Content -Encoding utf8 "$out\$Name-workers.json"
[pscustomobject]@{
    capture_exit_code = $capture.ExitCode
    worker_runs = $log.Count
    worker_killed = @($log | Where-Object state -eq 'killed').Count
    summary = Get-Content "$out\$Name-summary.json" -Raw | ConvertFrom-Json
} | ConvertTo-Json -Depth 5
