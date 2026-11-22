# Invented observations only: no Scribe executable, installer, user account or audio.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'win-installed-app-readiness.psm1') -Force
# Verify the hosted runner can load native token and Windows accessibility APIs.
Initialize-ScribeWin32Inspection

function New-Facts {
    return @{
        ProducerAttested = $true
        InstalledHashMatched = $true
        ShortcutMatched = $true
        DisposableProfile = $true
        DisposableLibrary = $true
        MediumUser = $true
    }
}
function New-Ready {
    return [pscustomobject]@{
        ProcessAlive = $true
        IdentityMatched = $true
        MediumIntegrity = $true
        WindowVisible = $true
        Responsive = $true
        WindowTitle = 'Scribe'
        Width = 1280
        Height = 800
        LiveHeading = $true
        StartupDialogTitle = $false
        ContinueButton = $false
        NavigationLabels = @('Live','Recordings','Settings')
    }
}
function Invoke-Fixture {
    param([hashtable]$Facts, [object[]]$Observations, [bool]$ExitClean = $true,
          [bool]$CleanupClean = $true, [int]$MaximumPolls = 4)
    $script:launches = 0
    $script:polls = 0
    $script:closes = 0
    $script:kills = 0
    $script:fixtureObservations = $Observations
    $script:fixtureExitClean = $ExitClean
    $script:fixtureCleanupClean = $CleanupClean
    return Invoke-ScribeLaunchSequence -Facts $Facts -Start {
        $script:launches++
        return [pscustomobject]@{ Pid = 12345 }
    } -Observe {
        param($p)
        $index = [Math]::Min($script:polls, $script:fixtureObservations.Count - 1)
        $script:polls++
        return $script:fixtureObservations[$index]
    } -Close {
        param($p)
        $script:closes++
        return $script:fixtureExitClean
    } -ForceStop {
        param($p)
        $script:kills++
        return $script:fixtureCleanupClean
    } -Pause {} -MaximumSeconds 10 -MaximumPolls $MaximumPolls
}
function Assert-Reject {
    param([string]$Label, [scriptblock]$Action, [string]$ErrorPattern)
    try {
        & $Action | Out-Null
        throw "$Label incorrectly passed"
    } catch {
        if ($_.Exception.Message -notmatch $ErrorPattern) {
            throw "$Label produced wrong failure: $($_.Exception.Message)"
        }
    }
}

# Two complete renderer observations establish startup, then a controlled WM_CLOSE succeeds.
$ready = New-Ready
$ok = Invoke-Fixture (New-Facts) @($ready,$ready)
if ($ok.Result -cne 'PASS' -or $ok.PollCount -ne 2 -or
    $script:launches -ne 1 -or $script:closes -ne 1 -or $script:kills -ne 0) {
    throw 'Synthetic verified GUI readiness and graceful-exit control failed'
}

# The first-run modal is also a renderer/backend-backed UI and needs both markers.
$firstLaunch = New-Ready
$firstLaunch.LiveHeading = $false
$firstLaunch.NavigationLabels = @()
$firstLaunch.StartupDialogTitle = $true
$firstLaunch.ContinueButton = $true
$modal = Invoke-Fixture (New-Facts) @($firstLaunch,$firstLaunch)
if ($modal.Result -cne 'PASS' -or $script:closes -ne 1) {
    throw 'Synthetic first-launch modal was not accepted as real renderer UI'
}

# A visible title/window alone is not renderer-ready; no grace on an empty UI.
$blank = New-Ready
$blank.NavigationLabels = @('Live')
$blank.LiveHeading = $false
Assert-Reject 'nonready renderer' {
    Invoke-Fixture (New-Facts) @($blank,$blank,$blank) -MaximumPolls 3
} 'never reached verified application readiness'
if ($script:launches -ne 1 -or $script:closes -ne 0 -or $script:kills -ne 1) {
    throw 'Window-only or splash-only startup passed, or cleanup omitted'
}
# One ready sample without a second stable observation must time out.
Assert-Reject 'unstable readiness' {
    Invoke-Fixture (New-Facts) @($ready) -MaximumPolls 1
} 'never reached verified application readiness'
if ($script:kills -ne 1) { throw 'Unstable startup did not clean up its process' }

# Wrong installed process binary, owner, profile argument or session never reaches ready.
$wrongProcess = New-Ready
$wrongProcess.IdentityMatched = $false
Assert-Reject 'wrong process identity' {
    Invoke-Fixture (New-Facts) @($wrongProcess)
} 'executable, owner, session or profile mismatch'
if ($script:closes -ne 0 -or $script:kills -ne 1) {
    throw 'Wrong-process probe did not refuse before readiness'
}
foreach ($field in @('InstalledHashMatched','ShortcutMatched','DisposableProfile','DisposableLibrary')) {
    $bad = New-Facts
    $bad[$field] = $false
    Assert-Reject "incorrect $field" {
        Invoke-Fixture $bad @($ready,$ready)
    } 'prerequisites or producer attestation missing'
    if ($script:launches -ne 0) { throw "Executable launched despite invalid $field" }
}

# Process elevation fails even when the GUI itself seems ready.
$elevated = New-Ready
$elevated.MediumIntegrity = $false
Assert-Reject 'unexpected elevation' {
    Invoke-Fixture (New-Facts) @($elevated)
} 'elevated or unknown token'
if ($script:kills -ne 1) { throw 'Unexpected-elevation probe left a process' }
$badToken = New-Facts
$badToken.MediumUser = $false
Assert-Reject 'admin/sandbox parent' {
    Invoke-Fixture $badToken @($ready,$ready)
} 'prerequisites'
if ($script:launches -ne 0) { throw 'Admin parent launched Scribe' }

# Crash before GUI ready and failures during controlled exit/cleanup are hard failures.
$crashed = New-Ready
$crashed.ProcessAlive = $false
Assert-Reject 'crash' {
    Invoke-Fixture (New-Facts) @($crashed)
} 'exited or crashed'
if ($script:kills -ne 1) { throw 'Crash cleanup was not attempted' }
Assert-Reject 'failed graceful exit' {
    Invoke-Fixture (New-Facts) @($ready,$ready) -ExitClean $false
} 'failed clean, bounded'
if ($script:kills -ne 1) { throw 'Failed exit was not forcibly cleaned up' }
Assert-Reject 'failed cleanup' {
    Invoke-Fixture (New-Facts) @($crashed) -CleanupClean $false
} 'process-tree cleanup failed'
if ($script:kills -ne 1) { throw 'Failure was not recorded as failed cleanup' }

# Missing or mismatched producer attestations are refused before any Start callback.
foreach ($field in @('ProducerAttested','InstalledHashMatched')) {
    $untrusted = New-Facts
    $untrusted[$field] = $false
    Assert-Reject "absent independent $field" {
        Invoke-Fixture $untrusted @($ready,$ready)
    } 'prerequisites'
    if ($script:launches -ne 0 -or $script:closes -ne 0 -or $script:kills -ne 0) {
        throw "Untrusted $field reached an installed-app callback"
    }
}
Write-Output 'Installed Scribe GUI-ready/exit/identity/isolation/trust synthetic behavior PASS'
