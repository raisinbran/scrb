# Observer validation test 4 (observe-live-v3; short test, deliberately ended at about 180 s after Record; no Snipping Tool video, no overlay)
# Derived from run 3 (Windows PowerShell 5.1). Distinct variable names (PowerShell is case-insensitive).
# Drives only the Meeting Scribe window (UIA invoke + mouse wheel over the transcript pane) and Snipping Tool's recording bar.
$ErrorActionPreference = 'Stop'
$dirPre = 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108'
$dirEv = "$dirPre\observer-validation-4"
$dirAsm = "$dirPre\renders-units-20261109-r3-derived-1\assembly"
$dirScr = 'C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest'
$appPid = 33480
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
function Tick { [Diagnostics.Stopwatch]::GetTimestamp() }
$logFile = "$dirEv\actions.log"
function Act($msg) { "{0}`t{1}`t{2}" -f (Tick), [DateTime]::UtcNow.ToString('o'), $msg | Add-Content $logFile -Encoding utf8 }
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
function Wheel($notches) { # positive = up, over the transcript pane only
    $vp = FindApp 'Live transcript'; if ($null -eq $vp) { Act 'wheel: no viewport'; return }
    $rc = $vp.Current.BoundingRectangle; [void][N]::SetCursorPos([int]($rc.X + $rc.Width / 2), [int]($rc.Y + $rc.Height / 2))
    $delta = if ($notches -gt 0) { 120 } else { -120 }
    for ($i = 0; $i -lt [Math]::Abs($notches); $i++) { [N]::mouse_event(0x0800, 0, 0, $delta, 0); Start-Sleep -Milliseconds 80 }
}
function JumpLive {
    $jb = (AppWin).FindAll('Descendants', [System.Windows.Automation.Condition]::TrueCondition) | ? { $_.Current.Name -match 'Jump to' } | Select -First 1
    if ($jb) { $jb.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); Act "pressed '$($jb.Current.Name)'" } else { Act 'jump button not present' }
}
function Level($name) { $pb = FindApp $name; if ($null -eq $pb) { return -1 }; try { $pb.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).Current.Value } catch { -2 } }
function Cleanup { foreach ($proc in @($script:procFrames, $script:procRes, $script:procObs)) { if ($proc) { try { Stop-Process -Id $proc.Id -Force } catch { } } } }

$hwnd = (Get-Process -Id $appPid).MainWindowHandle; [void][N]::ShowWindow($hwnd, 9); [void][N]::SetForegroundWindow($hwnd); Start-Sleep 1
Act 'orchestrator start'
# 2 observer BEFORE Record
$obsArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$dirScr\observe-live-v3.ps1`" -AppProcessId $appPid -OutputFile `"$dirEv\raw.jsonl`" -Seconds 400 -ViewportName `"Live transcript`" -WordBounds"
$script:procObs = Start-Process powershell.exe -ArgumentList $obsArgs -RedirectStandardOutput "$dirEv\observer-stdout.txt" -RedirectStandardError "$dirEv\observer-stderr.txt" -WindowStyle Hidden -PassThru
Act "observer started pid $($script:procObs.Id)"
$originQpc = $null
for ($i = 0; $i -lt 50 -and -not $originQpc; $i++) { Start-Sleep -Milliseconds 200
    try { $fs = [IO.File]::Open("$dirEv\raw.jsonl", 'Open', 'Read', 'ReadWrite'); $sr = New-Object IO.StreamReader($fs); $first = $sr.ReadLine(); $sr.Close(); if ($first) { $originQpc = ($first | ConvertFrom-Json).origin_qpc } } catch { } }
if (-not $originQpc) { Act 'ABORT: origin_qpc not readable while observer runs'; Cleanup; throw 'origin' }
Act "origin_qpc read while running: $originQpc"
# 4 supplementary frame capture and resource sampler
New-Item -ItemType Directory "$dirEv\frames" | Out-Null
$capSrc = @'
param($dir)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | ? { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object Drawing.Imaging.EncoderParameters(1); $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]60)
$bd = [Windows.Forms.Screen]::PrimaryScreen.Bounds
while ($true) { $t = [Diagnostics.Stopwatch]::GetTimestamp(); $bm = New-Object Drawing.Bitmap $bd.Width, $bd.Height; $g = [Drawing.Graphics]::FromImage($bm)
  $g.CopyFromScreen($bd.Location, [Drawing.Point]::Empty, $bd.Size); $bm.Save("$dir\$t.jpg", $codec, $ep); $g.Dispose(); $bm.Dispose(); Start-Sleep -Milliseconds 400 }
'@
Set-Content "$dirEv\frame-capture.ps1" $capSrc
$script:procFrames = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dirEv\frame-capture.ps1`" -dir `"$dirEv\frames`"" -PassThru -WindowStyle Hidden
$resSrc = @'
param($csv,$obsPid)
"utc,observer_cpu_s,observer_ws_mb,electron_cpu_s,electron_ws_mb" | Out-File $csv -Encoding ascii
while ($true) { $o = Get-Process -Id $obsPid -ErrorAction SilentlyContinue; $el = Get-Process electron -ErrorAction SilentlyContinue
  "{0},{1},{2},{3},{4}" -f [DateTime]::UtcNow.ToString('o'), [Math]::Round($o.CPU,2), [Math]::Round($o.WorkingSet64/1MB,1), [Math]::Round(($el|Measure CPU -Sum).Sum,2), [Math]::Round(($el|Measure WorkingSet64 -Sum).Sum/1MB,1) | Add-Content $csv -Encoding ascii; Start-Sleep 5 }
'@
Set-Content "$dirEv\resource-sampler.ps1" $resSrc
$script:procRes = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dirEv\resource-sampler.ps1`" -csv `"$dirEv\resources.csv`" -obsPid $($script:procObs.Id)" -PassThru -WindowStyle Hidden
Start-Sleep 6; Act 'pre-record baseline done'
# 5 playback waiter; PROVE READY before Record
$playArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$dirPre\tools-d2-v2\play-sources.ps1`" -MicrophoneWav `"$dirAsm\microphone.wav`" -MeetingWav `"$dirAsm\meeting.wav`" -ExpectedMicrophoneSha256 1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4 -ExpectedMeetingSha256 3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7 -OutFolder `"$dirEv\playback-log`" -RecordingReadyFile `"$dirEv\recording-ready.txt`" -Play -OwnerApprovedLongTest"
$procPlay = Start-Process powershell.exe -ArgumentList $playArgs -RedirectStandardOutput "$dirEv\playback-stdout.txt" -RedirectStandardError "$dirEv\playback-stderr.txt" -WindowStyle Hidden -PassThru
Act "play-sources started pid $($procPlay.Id)"
$playLog = "$dirEv\playback-log\play-sources-log.jsonl"; $ready = $false
for ($i = 0; $i -lt 100; $i++) { Start-Sleep -Milliseconds 200
    if ($procPlay.HasExited) { break }
    if (Test-Path $playLog) { $txt = ''; try { $txt = [IO.File]::ReadAllText($playLog) } catch { }; if ($txt -match '"devices"' -or $txt -match 'devices') { if ($txt -match 'files') { $ready = $true; break } } } }
if (-not $ready -or $procPlay.HasExited) { Act "ABORT before Record: playback not ready (exited=$($procPlay.HasExited))"; Cleanup; throw 'playback not ready' }
Act 'playback ready proof: process alive, log has devices and files lines, waiting for the ready file'
# 6 Record, ready file, prove first sample played
[void][N]::SetForegroundWindow($hwnd)
if (-not (PressApp 'Start')) { Act 'ABORT: app Start not found'; Cleanup; throw 'no Start' }
$t0 = Tick; Act 'RECORD pressed (Start invoked)'
Set-Content "$dirEv\recording-ready.txt" ([DateTime]::UtcNow.ToString('o')) -Encoding ascii; Act 'ready file written'
$played = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 200
    $txt = ''; try { $txt = [IO.File]::ReadAllText($playLog) } catch { }
    if ($txt -match 'microphone_start' -and $txt -match 'system_start') { $played = $true; break }
    if ($procPlay.HasExited) { break } }
if (-not $played) { Act 'ABORT after Record: first samples not logged as played'; [void](PressApp 'Stop'); Cleanup; throw 'no playback' }
Act 'first samples played (microphone_start and system_start in the playback log)'
$maxMic = 0; $maxMeet = 0
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 250; $m = Level 'Mic level'; $mm = Level 'Meeting level'; if ($m -gt $maxMic) { $maxMic = $m }; if ($mm -gt $maxMeet) { $maxMeet = $mm } }
Act "level meters within 10 s of Record: mic max $maxMic, meeting max $maxMeet"
# 7 scripted scrolling relative to Record
function WaitUntil($sec) { while (((Tick) - $t0) / $freqHz -lt $sec) { Start-Sleep -Milliseconds 100 } }
WaitUntil 50; Act 'scroll: up 12 notches (about 3 screens)'; Wheel 12; Start-Sleep 10; Act 'scroll: hold done'; JumpLive
WaitUntil 100; Act 'scroll: up as far as it goes (100 notches)'; Wheel 100; Start-Sleep 10; Act 'scroll: slow down'
for ($i = 0; $i -lt 20; $i++) { Wheel -1; Start-Sleep -Milliseconds 700 }; Act 'scroll: slow down done'; JumpLive
WaitUntil 150; Act 'scroll: up as far as it goes (100 notches)'; Wheel 100; Start-Sleep 10; Act 'scroll: hold done'; JumpLive
WaitUntil 180
# 8 wait for playback end, Stop, drain
Act 'planned early end at 180 s: stopping playback process'; try { Stop-Process -Id $procPlay.Id -Force } catch { }; Act 'playback process stopped'
[void][N]::SetForegroundWindow($hwnd)
if (-not (PressApp 'Stop')) { Act 'FAILED: app Stop not found' } else { Act 'STOP pressed (Stop invoked)' }
Start-Sleep 30; Act 'drain 30 s done'
Start-Sleep 3
Cleanup; Act 'observer, frame capture, sampler stopped'
