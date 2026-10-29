param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,
    [Parameter(Mandatory = $true)]
    [string]$Arguments,
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,
    [string]$Name = 'benchmark'
)

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stdout = Join-Path $OutputDirectory "$Name.stdout.txt"
$stderr = Join-Path $OutputDirectory "$Name.stderr.txt"
$started = [DateTimeOffset]::UtcNow
$process = Start-Process -FilePath $Executable -ArgumentList $Arguments `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru `
    -WindowStyle Hidden
$peakWorkingSet = 0L
while (-not $process.HasExited) {
    $process.Refresh()
    if ($process.WorkingSet64 -gt $peakWorkingSet) {
        $peakWorkingSet = $process.WorkingSet64
    }
    Start-Sleep -Milliseconds 50
}
$process.Refresh()
if ($process.PeakWorkingSet64 -gt $peakWorkingSet) {
    $peakWorkingSet = $process.PeakWorkingSet64
}
$ended = [DateTimeOffset]::UtcNow

[pscustomobject]@{
    Name = $Name
    ExitCode = $process.ExitCode
    StartedUtc = $started.ToString('o')
    ElapsedSeconds = [Math]::Round(($ended - $started).TotalSeconds, 3)
    PeakWorkingSetMiB = [Math]::Round($peakWorkingSet / 1MB, 1)
    StandardOutput = $stdout
    StandardError = $stderr
} | ConvertTo-Json

