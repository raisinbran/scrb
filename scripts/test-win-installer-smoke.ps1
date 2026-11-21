<#
Run the pinned W10 NSIS candidate in a disposable GitHub-hosted Windows runner.
This never launches Scribe, changes security policy, elevates, or touches owner data.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,

    [ValidateRange(1, 19)]
    [int]$TimeBudgetMinutes = 15,

    # New builds use a manifest generated from the verified staged package.
    # When omitted, the historical frozen W10 A2 candidate remains pinned.
    [string]$CandidateManifestPath
)

$ErrorActionPreference = 'Stop'
$guardsModule = Join-Path $PSScriptRoot 'win-installer-smoke-guards.psm1'
if (-not (Test-Path -LiteralPath $guardsModule -PathType Leaf)) {
    $guardsModule = Join-Path $PSScriptRoot '..\scripts\win-installer-smoke-guards.psm1'
}
Import-Module $guardsModule -Force
$expectedInstallerBytes = 131037432
$expectedInstallerSha256 = 'ec5c1ecd5207d44049d7b7dc065b2da7deb607497f04b7ca12488e78e37718d6'
$expectedApplicationSha256 = '31817c8b75c860fa36ddd0055677d5cbd374f4a564fa02097ccc77449993ae31'
$expectedInstallerName = 'Scribe Setup 0.1.0.exe'
$candidateSourceCommit = '73e899d0a45234617b9fbc81cf8f599747ec652b'
$isCurrentCandidate = -not [string]::IsNullOrWhiteSpace($CandidateManifestPath)
if ($isCurrentCandidate) {
    if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
        throw 'Missing disposable RUNNER_TEMP for candidate manifest'
    }
    $artifactRoot = Join-Path $env:RUNNER_TEMP 'scribe-installer-artifact'
    $manifestFull = Get-SmokeChildPath -Path $CandidateManifestPath -Parent $artifactRoot
    if (-not (Test-Path -LiteralPath $manifestFull -PathType Leaf)) {
        throw 'Installer candidate manifest is absent from disposable artifact directory'
    }
    $manifestItem = Get-Item -LiteralPath $manifestFull -Force
    if ($manifestItem.Length -gt 16384 -or
        ($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Refusing oversized or linked candidate manifest'
    }
    $candidate = Get-Content -LiteralPath $manifestFull -Raw | ConvertFrom-Json
    if ($candidate.schemaVersion -ne 1 -or $candidate.installMode -cne 'perUser' -or
        $candidate.sourceCommit -cnotmatch '^[a-f0-9]{40}
$stepStatuses = [ordered]@{
    runnerEligibility = 'NOT VERIFIED'
    installerIntegrity = 'NOT VERIFIED'
    applicationExecutableIntegrity = 'NOT VERIFIED'
    perUserInstall = 'NOT VERIFIED'
    startMenuShortcut = 'NOT VERIFIED'
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
    $summary = [ordered]@{
        schemaVersion = 1
        result = $Result
        canExecuteAutonomously = ($stepStatuses.runnerEligibility -eq 'PASS')
        a2Integrity = if ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
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
        scribeLaunched = $false
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
    $installer = Assert-SmokeArtifact -Path $InstallerPath -Parent $installerParent -ExpectedName $expectedInstallerName -ExpectedBytes $expectedInstallerBytes -ExpectedSha256 $expectedInstallerSha256
    $stepStatuses.installerIntegrity = 'PASS'

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

    Invoke-BoundedProcess $installer @('/S', "/D=$installRoot") 'Per-user installer'
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
$requiredSmokeStatuses = @($requiredSmokeSteps | ForEach-Object { $stepStatuses[$_] })
$result = if ($failure) { 'FAIL' } elseif (@($requiredSmokeStatuses | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } else { 'NOT VERIFIED' }
Write-SmokeSummary $result
if ($result -ne 'PASS') { exit 1 }

) {
        throw 'Invalid installer candidate identity'
    }
    if ($candidate.installer.name -cnotmatch '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe
$stepStatuses = [ordered]@{
    runnerEligibility = 'NOT VERIFIED'
    installerIntegrity = 'NOT VERIFIED'
    applicationExecutableIntegrity = 'NOT VERIFIED'
    perUserInstall = 'NOT VERIFIED'
    startMenuShortcut = 'NOT VERIFIED'
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
    $summary = [ordered]@{
        schemaVersion = 1
        result = $Result
        canExecuteAutonomously = ($stepStatuses.runnerEligibility -eq 'PASS')
        a2Integrity = if ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        modelHandover = @{
            status = 'OWNER VERIFIED; NOT RETESTED'
            manifestSha256 = '30f854def12121d612a4089c4a0b009c03983d3e22c100251f8d8a3e47d282b6'
        }
        isolatedInstallUninstall = if ($stepStatuses.perUserInstall -eq 'PASS' -and $stepStatuses.uninstall -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        sourceCommit = '73e899d0a45234617b9fbc81cf8f599747ec652b'
        runnerEnvironment = $env:RUNNER_ENVIRONMENT
        steps = $stepStatuses
        elapsedSeconds = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
        failure = $failure
        blocker = $failure
        scribeLaunched = $false
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
    $installer = Assert-SmokeArtifact -Path $InstallerPath -Parent $installerParent -ExpectedName $expectedInstallerName -ExpectedBytes $expectedInstallerBytes -ExpectedSha256 $expectedInstallerSha256
    $stepStatuses.installerIntegrity = 'PASS'

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

    Invoke-BoundedProcess $installer @('/S', "/D=$installRoot") 'Per-user installer'
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
$requiredSmokeStatuses = @($requiredSmokeSteps | ForEach-Object { $stepStatuses[$_] })
$result = if ($failure) { 'FAIL' } elseif (@($requiredSmokeStatuses | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } else { 'NOT VERIFIED' }
Write-SmokeSummary $result
if ($result -ne 'PASS') { exit 1 }

 -or
        $candidate.application.name -cne 'Scribe.exe' -or
        $candidate.provenance.name -cne 'PROVENANCE.json' -or
        $candidate.dependencyAudit.name -cne 'DEPENDENCY-AUDIT.json') {
        throw 'Invalid candidate artifact or provenance filenames'
    }
    foreach ($field in @('installer', 'application', 'provenance', 'dependencyAudit')) {
        $entry = $candidate.$field
        if ($null -eq $entry -or $entry.sha256 -cnotmatch '^[a-f0-9]{64}
$stepStatuses = [ordered]@{
    runnerEligibility = 'NOT VERIFIED'
    installerIntegrity = 'NOT VERIFIED'
    applicationExecutableIntegrity = 'NOT VERIFIED'
    perUserInstall = 'NOT VERIFIED'
    startMenuShortcut = 'NOT VERIFIED'
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
    $summary = [ordered]@{
        schemaVersion = 1
        result = $Result
        canExecuteAutonomously = ($stepStatuses.runnerEligibility -eq 'PASS')
        a2Integrity = if ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        modelHandover = @{
            status = 'OWNER VERIFIED; NOT RETESTED'
            manifestSha256 = '30f854def12121d612a4089c4a0b009c03983d3e22c100251f8d8a3e47d282b6'
        }
        isolatedInstallUninstall = if ($stepStatuses.perUserInstall -eq 'PASS' -and $stepStatuses.uninstall -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        sourceCommit = '73e899d0a45234617b9fbc81cf8f599747ec652b'
        runnerEnvironment = $env:RUNNER_ENVIRONMENT
        steps = $stepStatuses
        elapsedSeconds = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
        failure = $failure
        blocker = $failure
        scribeLaunched = $false
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
    $installer = Assert-SmokeArtifact -Path $InstallerPath -Parent $installerParent -ExpectedName $expectedInstallerName -ExpectedBytes $expectedInstallerBytes -ExpectedSha256 $expectedInstallerSha256
    $stepStatuses.installerIntegrity = 'PASS'

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

    Invoke-BoundedProcess $installer @('/S', "/D=$installRoot") 'Per-user installer'
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
$requiredSmokeStatuses = @($requiredSmokeSteps | ForEach-Object { $stepStatuses[$_] })
$result = if ($failure) { 'FAIL' } elseif (@($requiredSmokeStatuses | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } else { 'NOT VERIFIED' }
Write-SmokeSummary $result
if ($result -ne 'PASS') { exit 1 }

 -or
            [long]$entry.bytes -le 0) {
            throw "Invalid candidate manifest entry: $field"
        }
    }
    $expectedInstallerName = [string]$candidate.installer.name
    $expectedInstallerBytes = [long]$candidate.installer.bytes
    $expectedInstallerSha256 = [string]$candidate.installer.sha256
    $expectedApplicationSha256 = [string]$candidate.application.sha256
    $candidateSourceCommit = [string]$candidate.sourceCommit
}
$stepStatuses = [ordered]@{
    runnerEligibility = 'NOT VERIFIED'
    installerIntegrity = 'NOT VERIFIED'
    applicationExecutableIntegrity = 'NOT VERIFIED'
    perUserInstall = 'NOT VERIFIED'
    startMenuShortcut = 'NOT VERIFIED'
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
    $summary = [ordered]@{
        schemaVersion = 1
        result = $Result
        canExecuteAutonomously = ($stepStatuses.runnerEligibility -eq 'PASS')
        a2Integrity = if ($stepStatuses.installerIntegrity -eq 'PASS' -and $stepStatuses.applicationExecutableIntegrity -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        modelHandover = @{
            status = 'OWNER VERIFIED; NOT RETESTED'
            manifestSha256 = '30f854def12121d612a4089c4a0b009c03983d3e22c100251f8d8a3e47d282b6'
        }
        isolatedInstallUninstall = if ($stepStatuses.perUserInstall -eq 'PASS' -and $stepStatuses.uninstall -eq 'PASS') { 'PASS' } else { 'NOT VERIFIED' }
        sourceCommit = '73e899d0a45234617b9fbc81cf8f599747ec652b'
        runnerEnvironment = $env:RUNNER_ENVIRONMENT
        steps = $stepStatuses
        elapsedSeconds = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
        failure = $failure
        blocker = $failure
        scribeLaunched = $false
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
    $installer = Assert-SmokeArtifact -Path $InstallerPath -Parent $installerParent -ExpectedName $expectedInstallerName -ExpectedBytes $expectedInstallerBytes -ExpectedSha256 $expectedInstallerSha256
    $stepStatuses.installerIntegrity = 'PASS'

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

    Invoke-BoundedProcess $installer @('/S', "/D=$installRoot") 'Per-user installer'
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
$requiredSmokeStatuses = @($requiredSmokeSteps | ForEach-Object { $stepStatuses[$_] })
$result = if ($failure) { 'FAIL' } elseif (@($requiredSmokeStatuses | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } else { 'NOT VERIFIED' }
Write-SmokeSummary $result
if ($result -ne 'PASS') { exit 1 }

