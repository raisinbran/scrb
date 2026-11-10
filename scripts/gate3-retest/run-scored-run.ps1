# Gate 3 scored-run orchestrator (Windows PowerShell 5.1, not Administrator). NOT authorized to run until the owner authorizes the run in writing.
# Derived from validation-run-tools/run-validation5.ps1; capture steps are unchanged. Differences, all for run-time binding:
#  - every script (observer, overlay, playback, frame capture, sampler, verifier) is taken from THIS checkout ($PSScriptRoot), never from another path or an embedded copy;
#  - verify-against-manifest.py runs before capture and after capture; any non-zero exit aborts, and its output, the manifest SHA-256 and this script's SHA-256 go into run-record.txt;
#  - the app PID, evidence folder, manifest and durations are parameters; there are no scripted scroll bursts (run requirement).
# Scoring is a separate step and must run the verifier again immediately before it.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][int]$AppPid,
    [Parameter(Mandatory = $true)][string]$EvidenceDir,          # must not exist
    [Parameter(Mandatory = $true)][string]$ManifestPath,         # the owner-approved manifest
    [Parameter(Mandatory = $true)][string]$ApprovedManifestSha256, # the SHA-256 the owner approved (CRLF normalized to LF, as the verifier computes it)
    [Parameter(Mandatory = $true)][int]$ObserverSeconds,         # observer lifetime: lead-in + recording + drain, chosen in the run authorization
    [int]$RecordSeconds = 420,                                   # protocol v3 recording_seconds
    [int]$DrainSeconds = 30,                                     # as in validation-5
    [string]$PreflightDir = 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108',
    [string]$Python = 'python'
)
$ErrorActionPreference = 'Stop'
$dirScr = $PSScriptRoot
$dirRepo = (Resolve-Path "$PSScriptRoot\..\..").Path
$dirEv = $EvidenceDir
$dirAsm = "$PreflightDir\renders-units-20261109-r3-derived-1\assembly"
$appPid = $AppPid
$micSha = '1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4'
$meetSha = '3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7'
if (Test-Path $dirEv) { throw "EvidenceDir already exists: $dirEv" }
New-Item -ItemType Directory $dirEv | Out-Null
$logFile = "$dirEv\actions.log"
$recordFile = "$dirEv\run-record.txt"
function Tick { [Diagnostics.Stopwatch]::GetTimestamp() }
function Act($msg) { "{0}`t{1}`t{2}" -f (Tick), [DateTime]::UtcNow.ToString('o'), $msg | Add-Content $logFile -Encoding utf8 }
function Rec($msg) { "{0}`t{1}" -f [DateTime]::UtcNow.ToString('o'), $msg | Add-Content $recordFile -Encoding utf8 }
function Cleanup { foreach ($proc in @($script:procFrames, $script:procRes, $script:procOverlay, $script:procObs, $script:procPlay)) { if ($proc) { try { Stop-Process -Id $proc.Id -Force } catch { } } } }
# Any terminating error (every ABORT below ends in a throw) stops helpers and ends run-record.txt with exactly one final line: "run INVALID: <reason>". Only a run that reaches the last line ends with "run finished".
trap { Cleanup; Rec "run INVALID: $($_.Exception.Message)"; break }
function Verify($stage) {
    $outFile = "$dirEv\verifier-$stage.txt"
    Rec "verifier $stage starting"
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # Windows PowerShell 5.1 turns native stderr text into a terminating error under 'Stop'
    $out = & $Python -I "$dirScr\verify-against-manifest.py" --manifest $ManifestPath --approved-manifest-sha256 $ApprovedManifestSha256 --checkout $dirRepo 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $saved
    $out | Out-File $outFile -Encoding utf8
    Rec "verifier $stage exit code $code; output $outFile; output SHA-256 $((Get-FileHash $outFile -Algorithm SHA256).Hash.ToLower())"
    if ($code -ne 0) { Act "ABORT: verifier $stage exit $code"; throw "verifier $stage failed (exit $code); see $outFile" }
}
Rec "orchestrator $PSCommandPath SHA-256 $((Get-FileHash $PSCommandPath -Algorithm SHA256).Hash.ToLower())"
Rec "manifest $ManifestPath raw-file SHA-256 $((Get-FileHash $ManifestPath -Algorithm SHA256).Hash.ToLower()) (information only; the verifier compares the CRLF-normalized hash)"
Rec "approved manifest SHA-256 (owner-approved value passed to the verifier) $ApprovedManifestSha256"
Rec "python $((Get-Command $Python).Source) $(& $Python --version 2>&1)"
Rec "checkout $dirRepo HEAD $(git -C $dirRepo rev-parse HEAD)"
Verify 'before-capture'
# Bind $AppPid to the pinned candidate before anything is captured (Win32_Process needs no administrator)
$candExe = [IO.Path]::GetFullPath("$PreflightDir\candidate-553dd90\node_modules\electron\dist\electron.exe")
$candSha = 'c579acaab64b1c456bda1693cdf1a2ec7e4de7738b0e2d1b6349d60e8087143c'   # manifest native_candidate.built_artifacts, node_modules/electron/dist/electron.exe
$expProfile = [IO.Path]::GetFullPath("$((Split-Path $dirEv -Parent))\$((Split-Path $dirEv -Leaf))-app\profile")   # launch-candidate.ps1 -RunFolder '<run name>-app' makes <RunFolder>\profile
$wp = Get-CimInstance Win32_Process -Filter "ProcessId=$appPid"
if (-not $wp -or -not $wp.ExecutablePath) { throw "app PID ${appPid}: process or executable path not readable" }
Rec "app PID $appPid executable $($wp.ExecutablePath); command line $($wp.CommandLine)"
if ([IO.Path]::GetFullPath($wp.ExecutablePath) -ne $candExe) { Act 'ABORT: app PID executable is not the pinned candidate electron.exe'; throw "app PID $appPid runs $($wp.ExecutablePath), not $candExe" }
$exeSha = (Get-FileHash $wp.ExecutablePath -Algorithm SHA256).Hash.ToLower()
if ($exeSha -ne $candSha) { Act 'ABORT: app PID executable SHA-256 differs from the pin'; throw "app PID executable SHA-256 $exeSha, pinned $candSha" }
if ($wp.CommandLine.IndexOf("--user-data-dir=$expProfile", [StringComparison]::OrdinalIgnoreCase) -lt 0) { Act 'ABORT: app PID command line lacks the run profile'; throw "app PID command line has no --user-data-dir=$expProfile" }
if ($wp.CommandLine -match '--type=') { Act 'ABORT: app PID is a child process, not the main process'; throw "app PID $appPid is an Electron child process" }
$mains = @(Get-CimInstance Win32_Process | ? { $_.ExecutablePath -and ([IO.Path]::GetFullPath($_.ExecutablePath) -eq $candExe) -and $_.CommandLine -notmatch '--type=' })   # one candidate tree = one main process (children carry --type=)
if ($mains.Count -ne 1 -or $mains[0].ProcessId -ne $appPid) { Act 'ABORT: not exactly one candidate process tree'; throw "candidate main processes: $((@($mains | % ProcessId)) -join ',') (expected only $appPid)" }
Rec "app PID $appPid bound: pinned executable, SHA-256 $exeSha, run profile $expProfile, one candidate main process"

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class N { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,int d,int e);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c); }
"@
[void][N]::SetProcessDPIAware()
$uia = [System.Windows.Automation.AutomationElement]
$freqHz = [Diagnostics.Stopwatch]::Frequency
function AppWin { $uia::RootElement.FindFirst('Children', (New-Object System.Windows.Automation.PropertyCondition($uia::ProcessIdProperty, $appPid))) }
function FindApp($name) { (AppWin).FindFirst('Descendants', (New-Object System.Windows.Automation.PropertyCondition($uia::NameProperty, $name))) }
function PressApp($name) { $el = FindApp $name; if ($null -eq $el) { return $false }; $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); $true }
function SnipPress($autoId) {
    $sp = @(Get-Process | ? { $_.ProcessName -match 'Snipping|ScreenClipping' } | % Id)
    foreach ($top in $uia::RootElement.FindAll('Children', [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($sp -contains $top.Current.ProcessId) {
            $btn = $top.FindFirst('Descendants', (New-Object System.Windows.Automation.PropertyCondition($uia::AutomationIdProperty, $autoId)))
            if (-not $btn -and $autoId -eq 'StopButton') { $btn = $top.FindAll('Descendants', [System.Windows.Automation.Condition]::TrueCondition) | ? { $_.Current.ControlType.ProgrammaticName -match 'Button' -and $_.Current.Name -match 'Stop' } | Select -First 1 }
            if ($btn) { $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true } } }
    $false
}
function SnipTimer { $sp = @(Get-Process | ? { $_.ProcessName -match 'Snipping|ScreenClipping' } | % Id); $out = @()
    foreach ($top in $uia::RootElement.FindAll('Children', [System.Windows.Automation.Condition]::TrueCondition)) { if ($sp -contains $top.Current.ProcessId) {
        foreach ($e in $top.FindAll('Descendants', [System.Windows.Automation.Condition]::TrueCondition)) { $n = $e.Current.Name; if ($n -match '^\d{1,2}:\d\d(:\d\d)?$') { $out += $n } } } }
    ($out -join ',') }
$script:lastSnip = 0
function Level($name) { $pb = FindApp $name; if ($null -eq $pb) { return -1 }; try { $pb.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).Current.Value } catch { -2 } }

$hwnd = (Get-Process -Id $appPid).MainWindowHandle; [void][N]::ShowWindow($hwnd, 9); [void][N]::SetForegroundWindow($hwnd); Start-Sleep 1
Act 'orchestrator start'
# 1 video: Snipping Tool recording (region already chosen)
if (-not (SnipPress 'NewCaptureButton')) { Act 'ABORT: Snipping Tool New recording not found'; throw 'no snip new' }
Start-Sleep 2
function Abs($fx, $fy) { [N]::mouse_event(0x8001, [int]($fx * 65535), [int]($fy * 65535), 0, 0) }
Abs 0.01 0.12; Start-Sleep -Milliseconds 300; [N]::mouse_event(0x0002, 0, 0, 0, 0); Start-Sleep -Milliseconds 300
foreach ($frac in 0.2, 0.4, 0.6, 0.8, 0.98) { Abs (0.01 + $frac * 0.98) (0.12 + $frac * 0.86); Start-Sleep -Milliseconds 120 }
Abs 0.995 0.985; Start-Sleep -Milliseconds 300; [N]::mouse_event(0x0004, 0, 0, 0, 0); Start-Sleep 2
if (-not (SnipPress 'StartButton')) { Act 'ABORT: Snipping Tool Start not found'; throw 'no snip start' }
Act 'Snipping Tool recording Start invoked'; Start-Sleep 6
# 2 observer BEFORE Record
$obsArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$dirScr\observe-live-v3.ps1`" -AppProcessId $appPid -OutputFile `"$dirEv\raw.jsonl`" -Seconds $ObserverSeconds -ViewportName `"Live transcript`" -WordBounds -SkipWhitespaceElements"
$script:procObs = Start-Process powershell.exe -ArgumentList $obsArgs -RedirectStandardOutput "$dirEv\observer-stdout.txt" -RedirectStandardError "$dirEv\observer-stderr.txt" -WindowStyle Hidden -PassThru
$null = $script:procObs.Handle   # keeps the exit code readable after exit
Act "observer started pid $($script:procObs.Id)"
$originQpc = $null
for ($i = 0; $i -lt 50 -and -not $originQpc; $i++) { Start-Sleep -Milliseconds 200
    try { $fs = [IO.File]::Open("$dirEv\raw.jsonl", 'Open', 'Read', 'ReadWrite'); $sr = New-Object IO.StreamReader($fs); $first = $sr.ReadLine(); $sr.Close(); if ($first) { $originQpc = ($first | ConvertFrom-Json).origin_qpc } } catch { } }
if (-not $originQpc) { Act 'ABORT: origin_qpc not readable while observer runs'; Cleanup; [void](SnipPress 'StopButton'); throw 'origin' }
Act "origin_qpc read while running: $originQpc"
# 3 overlay (inside the recorded region)
$script:procOverlay = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dirScr\clock-overlay.ps1`" -OriginQpc $originQpc -X 20 -Y 800" -PassThru -WindowStyle Hidden
Act "overlay started pid $($script:procOverlay.Id)"; Start-Sleep 3
# 4 supplementary frame capture and resource sampler (the tracked scripts, not copies)
New-Item -ItemType Directory "$dirEv\frames" | Out-Null
$script:procFrames = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dirScr\validation-run-tools\frame-capture.ps1`" -dir `"$dirEv\frames`"" -PassThru -WindowStyle Hidden
$script:procRes = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dirScr\validation-run-tools\resource-sampler.ps1`" -csv `"$dirEv\resources.csv`" -obsPid $($script:procObs.Id)" -PassThru -WindowStyle Hidden
Start-Sleep 6; Act 'pre-record baseline done'
# 5 playback waiter; PROVE READY before Record
$playArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$dirScr\play-sources.ps1`" -MicrophoneWav `"$dirAsm\microphone.wav`" -MeetingWav `"$dirAsm\meeting.wav`" -ExpectedMicrophoneSha256 $micSha -ExpectedMeetingSha256 $meetSha -OutFolder `"$dirEv\playback-log`" -RecordingReadyFile `"$dirEv\recording-ready.txt`" -Play -OwnerApprovedLongTest"
$procPlay = Start-Process powershell.exe -ArgumentList $playArgs -RedirectStandardOutput "$dirEv\playback-stdout.txt" -RedirectStandardError "$dirEv\playback-stderr.txt" -WindowStyle Hidden -PassThru
$null = $procPlay.Handle   # keeps the exit code readable after exit
Act "play-sources started pid $($procPlay.Id)"
$playLog = "$dirEv\playback-log\play-sources-log.jsonl"; $ready = $false
for ($i = 0; $i -lt 100; $i++) { Start-Sleep -Milliseconds 200
    if ($procPlay.HasExited) { break }
    if (Test-Path $playLog) { $txt = ''; try { $txt = [IO.File]::ReadAllText($playLog) } catch { }; if ($txt -match '"devices"' -or $txt -match 'devices') { if ($txt -match 'files') { $ready = $true; break } } } }
if (-not $ready -or $procPlay.HasExited) { Act "ABORT before Record: playback not ready (exited=$($procPlay.HasExited))"; Cleanup; [void](SnipPress 'StopButton'); throw 'playback not ready' }
Act 'playback ready proof: process alive, log has devices and files lines, waiting for the ready file'
# 6 Record, ready file, prove first sample played
[void][N]::SetForegroundWindow($hwnd)
if (-not (PressApp 'Start')) { Act 'ABORT: app Start not found'; Cleanup; [void](SnipPress 'StopButton'); throw 'no Start' }
$t0 = Tick; Act 'RECORD pressed (Start invoked)'
# The app's Stop control exists only while recording (probe-1 UIA dumps: ready state has Start, recording state has Pause and Stop). Wait for it, at most 5 s, before the ready file releases the playback.
$stopSeen = $false
for ($i = 0; $i -lt 25 -and -not $stopSeen; $i++) { if ($null -ne (FindApp 'Stop')) { $stopSeen = $true } else { Start-Sleep -Milliseconds 200 } }
if (-not $stopSeen) { Act 'ABORT: app Stop control not seen within 5 s of Record; recording not confirmed, ready file not written'; [void](SnipPress 'StopButton'); throw 'recording not confirmed (no app Stop control within 5 s)' }
Act "app Stop control seen $([int](((Tick) - $t0) * 1000 / $freqHz)) ms after Record (recording confirmed)"
Set-Content "$dirEv\recording-ready.txt" ([DateTime]::UtcNow.ToString('o')) -Encoding ascii; Act 'ready file written'
$played = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 200
    $txt = ''; try { $txt = [IO.File]::ReadAllText($playLog) } catch { }
    if ($txt -match 'microphone_start' -and $txt -match 'system_start') { $played = $true; break }
    if ($procPlay.HasExited) { break } }
if (-not $played) { Act 'ABORT after Record: first samples not logged as played'; [void](PressApp 'Stop'); Cleanup; [void](SnipPress 'StopButton'); throw 'no playback' }
Act 'first samples played (microphone_start and system_start in the playback log)'
$maxMic = 0; $maxMeet = 0
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 250; $m = Level 'Mic level'; $mm = Level 'Meeting level'; if ($m -gt $maxMic) { $maxMic = $m }; if ($mm -gt $maxMeet) { $maxMeet = $mm } }
Act "level meters within 10 s of Record: mic max $maxMic, meeting max $maxMeet"
# 7 no scripted scrolling; wait for the recording length, logging the Snipping Tool timer
# RecordSeconds is the recording length (as in validation-5): playback is stopped there, so a 420 s run cuts about the last second of the 420 s sources (the scored interval ends at 380 s)
$playMarginSeconds = 5   # sources are exactly 420.0 s and start about 0.3 s after Record, so a healthy playback ends at or after RecordSeconds; an exit earlier than 5 s before it is a failure
while (((Tick) - $t0) / $freqHz -lt $RecordSeconds) { Start-Sleep -Milliseconds 100
    if ($procPlay.HasExited -and ((Tick) - $t0) / $freqHz -lt $RecordSeconds - $playMarginSeconds) { Act "ABORT: playback process exited early (exit code $($procPlay.ExitCode))"; [void](PressApp 'Stop'); [void](SnipPress 'StopButton'); throw "playback exited early (exit code $($procPlay.ExitCode)) at $([int](((Tick) - $t0) / $freqHz)) s of $RecordSeconds s" }
    if (((Tick) - $script:lastSnip) / $freqHz -gt 20) { $script:lastSnip = Tick; Act ('snipping timer text: ' + (SnipTimer)) } }
# 8 stop playback, Stop, drain
if ($procPlay.HasExited) { Act "playback process had already ended (exit code $($procPlay.ExitCode)) at record length $RecordSeconds s" } else { Act "recording length $RecordSeconds s reached: stopping playback process"; try { Stop-Process -Id $procPlay.Id -Force } catch { }; Act 'playback process stopped' }
[void][N]::SetForegroundWindow($hwnd)
if (-not (PressApp 'Stop')) { Act 'ABORT: app Stop not found at the end of the recording'; [void](SnipPress 'StopButton'); throw 'app Stop not found at the end of the recording' } else { Act 'STOP pressed (Stop invoked)' }
Start-Sleep $DrainSeconds; Act "drain $DrainSeconds s done"; Act ('snipping timer text before Stop: ' + (SnipTimer))
if (SnipPress 'StopButton') { Act 'Snipping Tool recording Stop invoked' } else { Act 'ABORT: Snipping Tool Stop not found'; throw 'Snipping Tool Stop not found' }
Start-Sleep 3
if ($script:procObs.HasExited) { $xt = $script:procObs.ExitTime.ToUniversalTime().ToString('o'); Act "ABORT: observer exited before the end of the drain (exit code $($script:procObs.ExitCode), at $xt)"; throw "observer exited before the end of the drain (exit code $($script:procObs.ExitCode), at $xt)" }
foreach ($h in @(@('frame capture', $script:procFrames), @('resource sampler', $script:procRes))) { if ($h[1].HasExited) { Act "WARNING: $($h[0]) exited early (supplementary; not a validity condition)" } }
Cleanup; Act 'observer, overlay, frame capture, sampler stopped'
Verify 'after-capture'
Rec 'run finished'
