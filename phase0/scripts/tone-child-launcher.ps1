param(
    [int]$FrequencyHz = 880,
    [int]$DurationSeconds = 14,
    [int]$DelaySeconds = 0,
    [int]$LauncherDelaySeconds = 2
)

$player = Join-Path $PSScriptRoot '..\probes\windows-tone-player\TonePlayer.exe'
if ($LauncherDelaySeconds -gt 0) {
    Start-Sleep -Seconds $LauncherDelaySeconds
}
$child = Start-Process -FilePath $player -ArgumentList @(
    $FrequencyHz,
    $DurationSeconds,
    $DelaySeconds
) -WindowStyle Hidden -PassThru
$child.WaitForExit()
exit $child.ExitCode

