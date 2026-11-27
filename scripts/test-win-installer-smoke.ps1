<#
Run the pinned W10 NSIS candidate in a disposable GitHub-hosted Windows runner.
Only a producer-attested current candidate is GUI-launched under a disposable standard user.
No security policy changes, owner data, recording or model downloads.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,

    [ValidateRange(1, 19)]
    [int]$TimeBudgetMinutes = 15,

    # Current packages use per-run verified candidate hashes, not the frozen A2 pins.
    [string]$CandidateManifestPath,

    # These MUST be independent, protected producer-job outputs, never artifact fields.
    [string]$TrustedManifestSha256,
    [string]$TrustedSourceCommit,
    [string]$TrustedProvenanceSha256,
    [string]$TrustedDependencyAuditSha256,
    [string]$TrustedProducerRunId,
    [string]$TrustedProducerRunAttempt
)

$ErrorActionPreference = 'Stop'
$guardsModule = Join-Path $PSScriptRoot 'win-installer-smoke-guards.psm1'
if (-not (Test-Path -LiteralPath $guardsModule -PathType Leaf)) {
    $guardsModule = Join-Path $PSScriptRoot '..\scripts\win-installer-smoke-guards.psm1'
}
Import-Module $guardsModule -Force
Import-Module (Join-Path $PSScriptRoot 'win-installer-candidate-trust.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'win-installed-app-readiness.psm1') -Force
$expectedInstallerBytes = 131037432
$expectedInstallerSha256 = 'ec5c1ecd5207d44049d7b7dc065b2da7deb607497f04b7ca12488e78e37718d6'
$expectedApplicationSha256 = '31817c8b75c860fa36ddd0055677d5cbd374f4a564fa02097ccc77449993ae31'
$expectedInstallerName = 'Scribe Setup 0.2.0.exe'
$isCurrentCandidate = -not [string]::IsNullOrWhiteSpace($CandidateManifestPath)
$candidateSourceCommit = if ($isCurrentCandidate) { $null } else { '73e899d0a45234617b9fbc81cf8f599747ec652b' }
$stepStatuses = [ordered]@{
    runnerEligibility = 'NOT VERIFIED'
    installerIntegrity = 'NOT VERIFIED'
    applicationExecutableIntegrity = 'NOT VERIFIED'
    perUserInstall = 'NOT VERIFIED'
    startMenuShortcut = 'NOT VERIFIED'
    applicationLaunchReady = 'NOT VERIFIED'
    uninstall = 'NOT VERIFIED'
    syntheticUserDataPreserved = 'NOT VERIFIED'
    twoTrackRealCapture = 'NOT TESTED'
    finalTranscriptSeekCopy = 'NOT TESTED'
    cleanup = 'NOT VERIFIED'
}
$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$installRoot = $null
$userDataRoot = $null
$libraryRoot = $null
$shortcutPath = $null
$userDataCreated = $false
$libraryCreated = $false
$shortcutWasAbsent = $false
$failure = $null
$uninstallExe = $null

function Assert-Within([string]$Child, [string]$Parent, [string]$Label) {
    try { [void](Get-SmokeChildPath -Path $Child -Parent $Parent) }
    catch { throw "$Label is outside its disposable parent" }
}

function Assert-TimeRemaining {
    if ($stopwatch.Elapsed.TotalMinutes -ge $TimeBudgetMinutes) {
        throw "The $TimeBudgetMinutes-minute smoke-test budget expired"
    }
}

function Invoke-BoundedProcess([string]$FilePath, [string[]]$Arguments, [string]$Label) {
    Assert-TimeRemaining
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru
    $remaining = [Math]::Max(1, [int](($TimeBudgetMinutes * 60) - $stopwatch.Elapsed.TotalSeconds))
    if (-not $process.WaitForExit($remaining * 1000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "$Label exceeded the remaining smoke-test time budget"
    }
    if ($process.ExitCode -ne 0) { throw "$Label exited with code $($process.ExitCode)" }
}

function Write-SmokeSummary([string]$Result) {
    $readinessPath = if ($env:RUNNER_TEMP) { Join-Path $env:RUNNER_TEMP 'scribe-installed-app-readiness.json' } else { $null }
    $readinessEvidence = if ($readinessPath -and (Test-Path -LiteralPath $readinessPath -PathType Leaf)) {
        Get-Content -LiteralPath $readinessPath -Raw | ConvertFrom-Json -ErrorAction Stop
    } else { $null }
    $summary = [ordered]@{
        schemaVersion = 1
        result = $Result
        canExecuteAutonomously = ($stepStatuses.runnerEligibility -eq 'PASS')
        a2Integrity = if ($isCurrentCandidate) { 'NOT APPLICABLE' } elseif ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        currentCandidateIntegrity = if (-not $isCurrentCandidate) { 'NOT APPLICABLE' } elseif ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        modelHandover = @{
            status = if ($isCurrentCandidate) { 'NOT VERIFIED' } else { 'OWNER VERIFIED; NOT RETESTED' }
            manifestSha256 = if ($isCurrentCandidate) { $null } else { '30f854def12121d612a4089c4a0b009c03983d3e22c100251f8d8a3e47d282b6' }
        }
        isolatedInstallUninstall = if ($stepStatuses.perUserInstall -eq 'PASS' -and $stepStatuses.uninstall -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        sourceCommit = $candidateSourceCommit
        runnerEnvironment = $env:RUNNER_ENVIRONMENT
        steps = $stepStatuses
        elapsedSeconds = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
        failure = $failure
        blocker = $failure
        scribeLaunched = ($isCurrentCandidate -and $stepStatuses.applicationLaunchReady -ceq 'PASS')
        installedAppReadiness = $readinessEvidence
        recordingTested = $false
        securityPolicyChanged = $false
    }
    $json = $summary | ConvertTo-Json -Depth 6
    if ($env:RUNNER_TEMP) {
        $summaryPath = Join-Path $env:RUNNER_TEMP 'scribe-installer-smoke-summary.json'
        Set-Content -LiteralPath $summaryPath -Value $json -Encoding UTF8
        Write-Host "Machine-readable summary: $summaryPath"
    }
    Write-Output $json
    if ($env:GITHUB_STEP_SUMMARY) {
        Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value ('```json' + [Environment]::NewLine + $json + [Environment]::NewLine + '```')
    }
}

try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
        throw 'Refusing installation outside a disposable GitHub-hosted runner'
    }
    if (-not $env:RUNNER_TEMP -or -not $env:APPDATA -or -not $env:USERPROFILE) {
        throw 'Required GitHub runner and user-profile roots are unavailable'
    }
    [void](Assert-SmokeIdentity)
    $runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
    $profile = [IO.Path]::GetFullPath($env:USERPROFILE)
    $appData = [IO.Path]::GetFullPath($env:APPDATA)
    Assert-Within $appData $profile 'Roaming user-data root'
    $stepStatuses.runnerEligibility = 'PASS'

    $installerParent = Join-Path $runnerTemp 'scribe-installer-artifact'
    if ($isCurrentCandidate) {
        # Candidate-provided names, hashes and commit are NOT trusted here.
        # No candidate executable can start until Invoke-TrustedCandidateInstall succeeds.
        $installer = $null
    } else {
        $installer = Assert-SmokeArtifact -Path $InstallerPath -Parent $installerParent -ExpectedName $expectedInstallerName -ExpectedBytes $expectedInstallerBytes -ExpectedSha256 $expectedInstallerSha256
        $stepStatuses.installerIntegrity = 'PASS'
    }

    $userDataRoot = Join-Path $appData '@scrb\desktop'
    $libraryRoot = Join-Path $runnerTemp 'scribe-installer-smoke-library'
    $startMenu = Join-Path $appData 'Microsoft\Windows\Start Menu\Programs'
    $shortcutPath = Join-Path $startMenu 'Scribe.lnk'
    if (Test-Path -LiteralPath $userDataRoot) { throw 'Refusing a non-empty or pre-existing Scribe user-data root' }
    if (Test-Path -LiteralPath $libraryRoot) { throw 'Refusing a pre-existing synthetic library path' }
    if (Test-Path -LiteralPath $shortcutPath) { throw 'Refusing to overwrite a pre-existing Scribe Start Menu shortcut' }
    Assert-Within $userDataRoot $appData 'Synthetic user-data root'
    Assert-Within $libraryRoot $runnerTemp 'Synthetic library root'
    Assert-Within $shortcutPath $appData 'Start Menu shortcut'
    $shortcutWasAbsent = $true
    $installRoot = Join-Path $runnerTemp ('scribe-installer-smoke-' + [Guid]::NewGuid().ToString('N'))
    Assert-Within $installRoot $runnerTemp 'Install root'
    if (Test-Path -LiteralPath $installRoot) { throw 'Generated install root already exists' }

    New-Item -ItemType Directory -Path $userDataRoot -ErrorAction Stop | Out-Null
    $userDataCreated = $true
    New-Item -ItemType Directory -Path $libraryRoot -ErrorAction Stop | Out-Null
    $libraryCreated = $true
    $libraryMarker = Join-Path $libraryRoot 'fixture-preservation-marker.txt'
    $libraryBytes = [Text.Encoding]::UTF8.GetBytes('synthetic library preservation fixture')
    [IO.File]::WriteAllBytes($libraryMarker, $libraryBytes)
    $location = [ordered]@{ root = $libraryRoot } | ConvertTo-Json
    $locationPath = Join-Path $userDataRoot 'library-location.json'
    [IO.File]::WriteAllText($locationPath, $location, [Text.UTF8Encoding]::new($false))
    $locationHash = (Get-FileHash -LiteralPath $locationPath -Algorithm SHA256).Hash
    $libraryHash = (Get-FileHash -LiteralPath $libraryMarker -Algorithm SHA256).Hash

    if ($isCurrentCandidate) {
        $trust = @{
            CandidateManifestPath = $CandidateManifestPath
            InstallerPath = $InstallerPath
            ArtifactRoot = $installerParent
            TrustedManifestSha256 = $TrustedManifestSha256
            TrustedSourceCommit = $TrustedSourceCommit
            TrustedProvenanceSha256 = $TrustedProvenanceSha256
            TrustedDependencyAuditSha256 = $TrustedDependencyAuditSha256
            TrustedProducerRunId = $TrustedProducerRunId
            TrustedProducerRunAttempt = $TrustedProducerRunAttempt
        }
        # The SAME guard-to-launch function is used by the joint-substitution test.
        # Missing/mismatched trusted producer evidence throws before this callback.
        $verified = Invoke-TrustedCandidateInstall -Verification $trust -Launch {
            param([string]$verifiedInstaller)
            Invoke-BoundedProcess $verifiedInstaller @('/S', "/D=$installRoot") 'Per-user installer'
        }
        $expectedApplicationSha256 = $verified.ApplicationSha256
        $candidateSourceCommit = $verified.SourceCommit
        $stepStatuses.installerIntegrity = 'PASS'
    } else {
        Invoke-BoundedProcess $installer @('/S', "/D=$installRoot") 'Per-user installer'
    }
    $appExe = Join-Path $installRoot 'Scribe.exe'
    if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) { throw 'Installed Scribe.exe is missing' }
    $installedHash = (Get-FileHash -LiteralPath $appExe -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($installedHash -cne $expectedApplicationSha256) { throw 'Installed Scribe.exe hash does not match the pinned candidate' }
    $stepStatuses.applicationExecutableIntegrity = 'PASS'
    $uninstallExe = Join-Path $installRoot 'Uninstall Scribe.exe'
    if (-not (Test-Path -LiteralPath $uninstallExe -PathType Leaf)) { throw 'Per-user uninstaller is missing' }
    $stepStatuses.perUserInstall = 'PASS'

    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'Scribe Start Menu shortcut was not created' }
    $shell = New-Object -ComObject WScript.Shell
    $shortcutTarget = [IO.Path]::GetFullPath($shell.CreateShortcut($shortcutPath).TargetPath)
    if (-not [string]::Equals($shortcutTarget, [IO.Path]::GetFullPath($appExe), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Scribe Start Menu shortcut does not target the installed Scribe.exe'
    }
    $stepStatuses.startMenuShortcut = 'PASS'

    # A2's frozen historical path remains unchanged. A genuine current candidate
    # must prove a renderer-populated GUI and graceful exit before uninstall.
    if ($isCurrentCandidate) {
        $stepStatuses.applicationLaunchReady = 'FAIL'
        $remainingSeconds = [int](($TimeBudgetMinutes * 60) - $stopwatch.Elapsed.TotalSeconds)
        $launchBudget = [Math]::Min(35, ($remainingSeconds - 20))
        if ($launchBudget -lt 1) { throw 'No time budget remains for safe installed-app launch and cleanup' }
        $launch = Invoke-ScribeInstalledAppReadiness -InstalledExe $appExe -InstallRoot $installRoot -UserDataRoot $userDataRoot -AppDataRoot $appData -LibraryRoot $libraryRoot -RunnerTemp $runnerTemp -ShortcutTarget $shortcutTarget -ExpectedSha256 $expectedApplicationSha256 -ProducerAttested ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS' -and $stepStatuses.startMenuShortcut -eq 'PASS') -EvidencePath (Join-Path $runnerTemp 'scribe-installed-app-readiness.json') -MaximumSeconds $launchBudget
        if ($launch.result -cne 'PASS' -or $launch.cleanExit -cne 'PASS') {
            throw 'Installed Scribe GUI and controlled exit were not verified'
        }
        $stepStatuses.applicationLaunchReady = 'PASS'
    }

    Invoke-BoundedProcess $uninstallExe @('/S') 'Per-user uninstaller'
    if (Test-Path -LiteralPath $appExe) { throw 'Scribe.exe remains after uninstall' }
    $stepStatuses.uninstall = 'PASS'

    if (-not (Test-Path -LiteralPath $locationPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $libraryMarker -PathType Leaf)) {
        throw 'Synthetic user data or library was removed by uninstall'
    }
    if ((Get-FileHash -LiteralPath $locationPath -Algorithm SHA256).Hash -cne $locationHash -or
        (Get-FileHash -LiteralPath $libraryMarker -Algorithm SHA256).Hash -cne $libraryHash) {
        throw 'Synthetic user data or library changed during install/uninstall'
    }
    $stepStatuses.syntheticUserDataPreserved = 'PASS'
} catch {
    $failure = $_.Exception.Message
} finally {
    try {
        if ($uninstallExe -and (Test-Path -LiteralPath $uninstallExe -PathType Leaf)) {
            Invoke-BoundedProcess $uninstallExe @('/S') 'Cleanup uninstaller'
        }
        if ($shortcutWasAbsent -and $shortcutPath -and (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
            Remove-Item -LiteralPath $shortcutPath -Force
        }
        if ($installRoot -and (Test-Path -LiteralPath $installRoot)) {
            Assert-Within $installRoot $env:RUNNER_TEMP 'Install cleanup root'
            Remove-Item -LiteralPath $installRoot -Recurse -Force
        }
        if ($userDataCreated -and (Test-Path -LiteralPath $userDataRoot)) {
            Assert-Within $userDataRoot $env:APPDATA 'Synthetic data cleanup root'
            Remove-Item -LiteralPath $userDataRoot -Recurse -Force
        }
        if ($libraryCreated -and (Test-Path -LiteralPath $libraryRoot)) {
            Assert-Within $libraryRoot $env:RUNNER_TEMP 'Synthetic library cleanup root'
            Remove-Item -LiteralPath $libraryRoot -Recurse -Force
        }
        $stepStatuses.cleanup = 'PASS'
    } catch {
        $cleanupMessage = $_.Exception.Message
        if ($failure) { $failure = "$failure; cleanup: $cleanupMessage" }
        else { $failure = "cleanup: $cleanupMessage" }
        $stepStatuses.cleanup = 'FAIL'
    }
}

$requiredSmokeSteps = @(
    'runnerEligibility',
    'installerIntegrity',
    'applicationExecutableIntegrity',
    'perUserInstall',
    'startMenuShortcut',
    'uninstall',
    'syntheticUserDataPreserved',
    'cleanup'
)
if ($isCurrentCandidate) { $requiredSmokeSteps += 'applicationLaunchReady' }
$requiredSmokeStatuses = @($requiredSmokeSteps | ForEach-Object { $stepStatuses[$_] })
$result = if ($failure) { 'FAIL' } elseif (@($requiredSmokeStatuses | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } else { 'NOT VERIFIED' }
Write-SmokeSummary $result
if ($result -ne 'PASS') { exit 1 }

