# Windows-only installed Scribe GUI readiness; no IPC, Electron security changes or private data.
Set-StrictMode -Version Latest

function Test-ScribeLaunchFacts {
    param([Parameter(Mandatory)][hashtable]$Facts)
    foreach ($name in @('ProducerAttested','InstalledHashMatched','ShortcutMatched',
                         'DisposableProfile','DisposableLibrary','MediumUser')) {
        if (-not $Facts.ContainsKey($name) -or $Facts[$name] -ne $true) { return $false }
    }
    return $true
}

function Test-ScribeReadyObservation {
    param([Parameter(Mandatory)]$Observation)
    if ($Observation.ProcessAlive -ne $true -or
        $Observation.IdentityMatched -ne $true -or
        $Observation.MediumIntegrity -ne $true -or
        $Observation.WindowVisible -ne $true -or
        $Observation.Responsive -ne $true -or
        $Observation.WindowTitle -cne 'Scribe' -or
        $Observation.Width -lt 800 -or $Observation.Height -lt 560) { return $false }
    # An untouched isolated profile normally displays Scribe's real first-launch
    # React dialog. A splash or generic Electron window has neither this dialog
    # nor the three navigation controls and the Live screen heading.
    if ($Observation.StartupDialogTitle -eq $true -and
        $Observation.ContinueButton -eq $true) { return $true }
    if ($Observation.LiveHeading -ne $true) { return $false }
    $labels = @($Observation.NavigationLabels)
    foreach ($label in @('Live','Recordings','Settings')) {
        if ($labels -cnotcontains $label) { return $false }
    }
    return $true
}

# Injectable observations make the launch decision testable without running an EXE.
function Invoke-ScribeLaunchSequence {
    param(
        [Parameter(Mandatory)][hashtable]$Facts,
        [Parameter(Mandatory)][scriptblock]$Start,
        [Parameter(Mandatory)][scriptblock]$Observe,
        [Parameter(Mandatory)][scriptblock]$Close,
        [Parameter(Mandatory)][scriptblock]$ForceStop,
        [int]$MaximumSeconds = 35,
        [int]$MaximumPolls = 100,
        [scriptblock]$Pause = { Start-Sleep -Milliseconds 250 }
    )
    if (-not (Test-ScribeLaunchFacts $Facts)) {
        throw 'Installed application launch prerequisites or producer attestation missing'
    }
    if ($MaximumSeconds -lt 1 -or $MaximumSeconds -gt 45 -or $MaximumPolls -lt 1) {
        throw 'Invalid bounded application readiness budget'
    }
    $process = & $Start
    if ($null -eq $process) { throw 'Installed application launch returned no process' }
    $graceful = $false
    $stable = 0
    $pollCount = 0
    $clock = [Diagnostics.Stopwatch]::StartNew()
    try {
        while ($pollCount -lt $MaximumPolls -and $clock.Elapsed.TotalSeconds -lt $MaximumSeconds) {
            $pollCount++
            $sample = & $Observe $process
            if ($null -eq $sample -or $sample.ProcessAlive -ne $true) {
                throw 'Installed Scribe process exited or crashed before readiness'
            }
            if ($sample.IdentityMatched -ne $true) {
                throw 'Installed Scribe process executable, owner, session or profile mismatch'
            }
            if ($sample.MediumIntegrity -ne $true) {
                throw 'Installed Scribe process has an unexpected elevated or unknown token'
            }
            if (Test-ScribeReadyObservation $sample) { $stable++ } else { $stable = 0 }
            if ($stable -ge 2) { break }
            & $Pause
        }
        if ($stable -lt 2) {
            throw 'Installed Scribe GUI never reached verified application readiness'
        }
        if ((& $Close $process) -ne $true) {
            throw 'Installed Scribe failed clean, bounded WM_CLOSE shutdown'
        }
        $graceful = $true
        return [pscustomobject]@{
            Result = 'PASS'
            ReadyCondition = 'Responsive Scribe GUI with navigation/Live heading or first-launch dialog twice'
            PollCount = $pollCount
            CleanExit = $true
        }
    } finally {
        if (-not $graceful -and (& $ForceStop $process) -ne $true) {
            throw 'Installed Scribe process-tree cleanup failed after launch refusal'
        }
    }
}

function Initialize-ScribeWin32Inspection {
    if (-not ('ScribeInstalledWindowNative' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class ScribeInstalledWindowNative {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr w, IntPtr l,
        uint flags, uint milliseconds, out IntPtr result);
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer,
        int length, out int returned);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
    public static string TokenIdentity(IntPtr process) {
        IntPtr token = IntPtr.Zero;
        try {
            if (!OpenProcessToken(process, 8, out token)) return "UNKNOWN";
            int length = 0;
            GetTokenInformation(token, 25, IntPtr.Zero, 0, out length);
            if (length <= 0 || length > 4096) return "UNKNOWN";
            IntPtr buffer = Marshal.AllocHGlobal(length);
            try {
                if (!GetTokenInformation(token, 25, buffer, length, out length))
                    return "UNKNOWN";
                IntPtr sid = Marshal.ReadIntPtr(buffer);
                if (sid == IntPtr.Zero) return "UNKNOWN";
                return new SecurityIdentifier(sid).Value;
            } finally { Marshal.FreeHGlobal(buffer); }
        } finally { if (token != IntPtr.Zero) CloseHandle(token); }
    }
}
'@ -ErrorAction Stop
    }
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -ErrorAction Stop
}

function Get-ScribeProcessObservation {
    param([Parameter(Mandatory)]$Process,
          [Parameter(Mandatory)][string]$InstalledExe,
          [Parameter(Mandatory)][string]$UserDataRoot)
    $observation = [ordered]@{
        ProcessAlive = $false
        IdentityMatched = $false
        MediumIntegrity = $false
        WindowVisible = $false
        Responsive = $false
        WindowTitle = ''
        Width = 0
        Height = 0
        LiveHeading = $false
        StartupDialogTitle = $false
        ContinueButton = $false
        NavigationLabels = @()
    }
    $Process.Refresh()
    if ($Process.HasExited) { return [pscustomobject]$observation }
    $observation.ProcessAlive = $true
    $record = Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.Id)" -ErrorAction Stop
    if (-not $record) { return [pscustomobject]$observation }
    $owner = Invoke-CimMethod -InputObject $record -MethodName GetOwnerSid -ErrorAction Stop
    $normalizedCommand = ([string]$record.CommandLine).Replace('"', '')
    $profileArg = '--user-data-dir=' + [IO.Path]::GetFullPath($UserDataRoot)
    $exeMatches = [string]::Equals([IO.Path]::GetFullPath([string]$record.ExecutablePath),
                                  [IO.Path]::GetFullPath($InstalledExe),
                                  [StringComparison]::OrdinalIgnoreCase)
    $ownerMatches = $owner.ReturnValue -eq 0 -and $owner.Sid -ceq
                    [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $profileMatches = $normalizedCommand.IndexOf($profileArg,
                        [StringComparison]::OrdinalIgnoreCase) -ge 0
    $sessionMatches = $Process.SessionId -eq ([Diagnostics.Process]::GetCurrentProcess().SessionId)
    $observation.IdentityMatched = $exeMatches -and $ownerMatches -and
                                   $profileMatches -and $sessionMatches
    $observation.MediumIntegrity = [ScribeInstalledWindowNative]::TokenIdentity(
                                    $Process.Handle) -ceq 'S-1-16-8192'
    if (-not $observation.IdentityMatched -or -not $observation.MediumIntegrity) {
        return [pscustomobject]$observation
    }
    $handle = $Process.MainWindowHandle
    if ($handle -eq [IntPtr]::Zero) { return [pscustomobject]$observation }
    $result = [IntPtr]::Zero
    $observation.Responsive = [ScribeInstalledWindowNative]::SendMessageTimeout(
        $handle, 0, [IntPtr]::Zero, [IntPtr]::Zero, 2, 300, [ref]$result) -ne [IntPtr]::Zero
    if (-not $observation.Responsive) { return [pscustomobject]$observation }
    try {
        $window = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
        if ($null -eq $window -or $window.Current.ProcessId -ne $Process.Id) {
            return [pscustomobject]$observation
        }
        $observation.WindowTitle = [string]$window.Current.Name
        $observation.WindowVisible = -not $window.Current.IsOffscreen
        $bounds = $window.Current.BoundingRectangle
        $observation.Width = [int]$bounds.Width
        $observation.Height = [int]$bounds.Height
        $children = $window.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        $buttons = [Collections.Generic.List[string]]::new()
        for ($i = 0; $i -lt $children.Count; $i++) {
            $element = $children.Item($i)
            if ($element.Current.IsOffscreen) { continue }
            $name = [string]$element.Current.Name
            if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) {
                $buttons.Add($name)
            }
            if ($name -ceq 'Live' -and
                $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text) {
                $observation.LiveHeading = $true
            }
            if ($name -ceq 'Where are you based?' -and
                $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text) {
                $observation.StartupDialogTitle = $true
            }
            if ($name -ceq 'Continue' -and
                $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) {
                $observation.ContinueButton = $true
            }
        }
        $observation.NavigationLabels = $buttons.ToArray()
    } catch [System.Windows.Automation.ElementNotAvailableException] {
        # A window replaced during polling must prove readiness again.
    }
    return [pscustomobject]$observation
}

function Invoke-ScribeInstalledAppReadiness {
    param(
        [Parameter(Mandatory)][string]$InstalledExe,
        [Parameter(Mandatory)][string]$InstallRoot,
        [Parameter(Mandatory)][string]$UserDataRoot,
        [Parameter(Mandatory)][string]$AppDataRoot,
        [Parameter(Mandatory)][string]$LibraryRoot,
        [Parameter(Mandatory)][string]$RunnerTemp,
        [Parameter(Mandatory)][string]$ShortcutTarget,
        [Parameter(Mandatory)][string]$ExpectedSha256,
        [Parameter(Mandatory)][bool]$ProducerAttested,
        [Parameter(Mandatory)][string]$EvidencePath,
        [int]$MaximumSeconds = 35
    )
    $report = [ordered]@{
        result = 'FAIL'
        readiness = 'NOT VERIFIED'
        cleanExit = 'NOT VERIFIED'
        processId = $null
        condition = 'Responsive Scribe GUI with navigation/Live heading or first-launch dialog'
        failure = $null
    }
    try {
        $exe = [IO.Path]::GetFullPath($InstalledExe)
        $expectedExe = [IO.Path]::GetFullPath((Join-Path $InstallRoot 'Scribe.exe'))
        $profile = [IO.Path]::GetFullPath($UserDataRoot)
        $appData = [IO.Path]::GetFullPath($AppDataRoot).TrimEnd('\')
        $library = [IO.Path]::GetFullPath($LibraryRoot)
        $runner = [IO.Path]::GetFullPath($RunnerTemp).TrimEnd('\')
        $identity = Get-SmokeIdentityFacts
        $hashOk = (Test-Path -LiteralPath $exe -PathType Leaf) -and
                  ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ceq
                    $ExpectedSha256)
        $pointer = Join-Path $profile 'library-location.json'
        $pointedLibrary = ''
        if (Test-Path -LiteralPath $pointer -PathType Leaf) {
            $pointedLibrary = [string]((Get-Content -LiteralPath $pointer -Raw |
                                       ConvertFrom-Json -ErrorAction Stop).root)
        }
        $profileSafe = $profile.StartsWith($appData + '\',
            [StringComparison]::OrdinalIgnoreCase) -and
            -not ((Get-Item -LiteralPath $profile -Force).Attributes -band
                  [IO.FileAttributes]::ReparsePoint)
        $librarySafe = $library.StartsWith($runner + '\',
            [StringComparison]::OrdinalIgnoreCase) -and
            [string]::Equals([IO.Path]::GetFullPath($pointedLibrary), $library,
                [StringComparison]::OrdinalIgnoreCase) -and
            -not ((Get-Item -LiteralPath $library -Force).Attributes -band
                  [IO.FileAttributes]::ReparsePoint)
        $facts = @{
            ProducerAttested = $ProducerAttested
            InstalledHashMatched = $hashOk -and
                [string]::Equals($exe, $expectedExe, [StringComparison]::OrdinalIgnoreCase)
            ShortcutMatched = [string]::Equals([IO.Path]::GetFullPath($ShortcutTarget), $exe,
                [StringComparison]::OrdinalIgnoreCase)
            DisposableProfile = $profileSafe
            DisposableLibrary = $librarySafe
            MediumUser = -not $identity.IsSystem -and -not $identity.IsAdministrator -and
                         $identity.IntegrityLevel -ceq 'Medium'
        }
        if (-not (Test-ScribeLaunchFacts $facts)) {
            throw 'Independent trust, installed path, isolated roots or Medium token check failed'
        }
        Initialize-ScribeWin32Inspection
        $start = {
            $p = Start-Process -FilePath $exe -ArgumentList ('--user-data-dir="' + $profile + '"') -PassThru
            $report.processId = $p.Id
            return $p
        }.GetNewClosure()
        $observe = {
            param($p)
            Get-ScribeProcessObservation -Process $p -InstalledExe $exe -UserDataRoot $profile
        }.GetNewClosure()
        $close = {
            param($p)
            $p.Refresh()
            if ($p.HasExited -or -not $p.CloseMainWindow()) { return $false }
            if (-not $p.WaitForExit(7000)) { return $false }
            return $p.ExitCode -eq 0
        }.GetNewClosure()
        $forceStop = {
            param($p)
            try {
                $p.Refresh()
                if (-not $p.HasExited) { $p.Kill($true); [void]$p.WaitForExit(4000) }
                return $p.HasExited
            } catch { return $false }
        }.GetNewClosure()
        $result = Invoke-ScribeLaunchSequence -Facts $facts -Start $start -Observe $observe -Close $close -ForceStop $forceStop -MaximumSeconds $MaximumSeconds
        $report.result = $result.Result
        $report.readiness = 'PASS'
        $report.cleanExit = 'PASS'
        $report.polls = $result.PollCount
    } catch {
        $report.failure = $_.Exception.Message
        throw
    } finally {
        # Parent retains this synthetic-only report before deleting the disposable profile.
        [IO.File]::WriteAllText($EvidencePath,
            ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    }
    return [pscustomobject]$report
}

Export-ModuleMember -Function Test-ScribeLaunchFacts, Test-ScribeReadyObservation, Invoke-ScribeLaunchSequence, Invoke-ScribeInstalledAppReadiness, Get-ScribeProcessObservation, Initialize-ScribeWin32Inspection
