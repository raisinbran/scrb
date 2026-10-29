param(
    [int]$DurationSeconds = 600,
    [int]$WorkerCrashSeconds = 60
)

$ErrorActionPreference = 'Stop'
$scratch = Split-Path -Parent $PSScriptRoot
$captureDirectory = Join-Path $scratch 'artifacts\capture'
$toneExecutable = Join-Path $scratch 'probes\windows-tone-player\TonePlayer.exe'
$workerExecutable = Join-Path $scratch 'probes\windows-worker-crash\WorkerCrash.exe'
$loopbackExecutable = Join-Path $scratch 'upstream\windows-classic-samples\Samples\ApplicationLoopback\cpp\x64\Release\ApplicationLoopback.exe'
$microphoneExecutable = Join-Path $scratch 'upstream\windows-classic-samples\Samples\Win7Samples\multimedia\audio\CaptureSharedEventDriven\WASAPICaptureSharedEventDriven.exe'
$appOutput = Join-Path $captureDirectory 'long-run-app.wav'
$micOutput = Join-Path $captureDirectory 'long-run-mic.wav'

New-Item -ItemType Directory -Force -Path $captureDirectory | Out-Null
$microphoneFilesBefore = @(
    Get-ChildItem -LiteralPath $captureDirectory -Filter 'WASAPICaptureEventDriven-*.WAV' |
        ForEach-Object FullName
)

$toneProcess = Start-Process -FilePath $toneExecutable `
    -ArgumentList "880 $($DurationSeconds + 4) 2" -PassThru -WindowStyle Hidden

$loopbackArguments = "$($toneProcess.Id) includetree `"$appOutput`" $DurationSeconds"
$loopbackStarted = [DateTimeOffset]::UtcNow
$loopbackProcess = Start-Process -FilePath $loopbackExecutable `
    -ArgumentList $loopbackArguments `
    -RedirectStandardOutput (Join-Path $captureDirectory 'long-run-app.stdout.txt') `
    -RedirectStandardError (Join-Path $captureDirectory 'long-run-app.stderr.txt') `
    -PassThru -WindowStyle Hidden

$microphoneStarted = [DateTimeOffset]::UtcNow
$microphoneProcess = Start-Process -FilePath $microphoneExecutable `
    -ArgumentList "-d:$DurationSeconds -communications" `
    -WorkingDirectory $captureDirectory `
    -RedirectStandardOutput (Join-Path $captureDirectory 'long-run-mic.stdout.txt') `
    -RedirectStandardError (Join-Path $captureDirectory 'long-run-mic.stderr.txt') `
    -PassThru -WindowStyle Hidden

$workerStarted = [DateTimeOffset]::UtcNow
$workerProcess = Start-Process -FilePath $workerExecutable `
    -ArgumentList "$WorkerCrashSeconds" -PassThru -WindowStyle Hidden

$peakWorkingSet = 0L
while (-not $loopbackProcess.HasExited -or -not $microphoneProcess.HasExited) {
    foreach ($process in @($loopbackProcess, $microphoneProcess)) {
        if (-not $process.HasExited) {
            $process.Refresh()
            if ($process.WorkingSet64 -gt $peakWorkingSet) {
                $peakWorkingSet = $process.WorkingSet64
            }
        }
    }
    Start-Sleep -Seconds 1
}

$loopbackProcess.WaitForExit()
$microphoneProcess.WaitForExit()
$workerProcess.WaitForExit()
$toneProcess.WaitForExit()
$ended = [DateTimeOffset]::UtcNow

$microphoneFilesAfter = @(
    Get-ChildItem -LiteralPath $captureDirectory -Filter 'WASAPICaptureEventDriven-*.WAV' |
        ForEach-Object FullName
)
$newMicrophoneFile = @(
    $microphoneFilesAfter |
        Where-Object { $_ -notin $microphoneFilesBefore } |
        Sort-Object { (Get-Item -LiteralPath $_).LastWriteTime } -Descending |
        Select-Object -First 1
)
if ($newMicrophoneFile.Count -eq 1) {
    Copy-Item -LiteralPath $newMicrophoneFile[0] -Destination $micOutput -Force
}

$logicalProcessors = [Environment]::ProcessorCount
$captureCpuSeconds =
    $loopbackProcess.TotalProcessorTime.TotalSeconds +
    $microphoneProcess.TotalProcessorTime.TotalSeconds
$wallSeconds = ($ended - $loopbackStarted).TotalSeconds
$averageCaptureCpuPercent = if ($wallSeconds -gt 0) {
    100 * $captureCpuSeconds / ($wallSeconds * $logicalProcessors)
} else { 0 }

[pscustomobject]@{
    DurationRequestedSeconds = $DurationSeconds
    WallSeconds = [Math]::Round($wallSeconds, 3)
    CaptureStartOffsetMs = [Math]::Round(($microphoneStarted - $loopbackStarted).TotalMilliseconds, 3)
    WorkerStartOffsetMs = [Math]::Round(($workerStarted - $loopbackStarted).TotalMilliseconds, 3)
    WorkerCrashRequestedSeconds = $WorkerCrashSeconds
    WorkerExitCode = $workerProcess.ExitCode
    LoopbackExitCode = $loopbackProcess.ExitCode
    MicrophoneExitCode = $microphoneProcess.ExitCode
    AppOutputExists = Test-Path -LiteralPath $appOutput
    MicOutputExists = Test-Path -LiteralPath $micOutput
    AverageCaptureCpuPercent = [Math]::Round($averageCaptureCpuPercent, 3)
    PeakCaptureProcessWorkingSetMiB = [Math]::Round($peakWorkingSet / 1MB, 1)
    AppOutput = $appOutput
    MicOutput = $micOutput
} | ConvertTo-Json
