# Genuine NSIS smoke under a fresh non-admin local user on an ephemeral GitHub runner.
# This script never consumes private owner models/recordings or W10/M5 binaries.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunnerTemp,
    [Parameter(Mandatory)][string]$TrustedManifestSha256,
    [Parameter(Mandatory)][string]$TrustedSourceCommit,
    [Parameter(Mandatory)][string]$TrustedProvenanceSha256,
    [Parameter(Mandatory)][string]$TrustedDependencyAuditSha256,
    [Parameter(Mandatory)][string]$TrustedProducerRunId,
    [Parameter(Mandatory)][string]$TrustedProducerRunAttempt
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$runner = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
if ($env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    $env:GITHUB_EVENT_NAME -cne 'workflow_dispatch' -or
    $env:GITHUB_REPOSITORY -cne 'raisinbran/scrb' -or
    -not [string]::Equals($runner, ([IO.Path]::GetFullPath($RunnerTemp).TrimEnd('\')),
        [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Genuine installer smoke is restricted to an explicit hosted dispatch'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($identity.IsSystem -or -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Only the ephemeral runner administrator may bootstrap a disposable standard user'
}
foreach ($hash in @($TrustedManifestSha256,$TrustedProvenanceSha256,$TrustedDependencyAuditSha256)) {
    if ($hash -cnotmatch '^[a-f0-9]{64}$') { throw 'Independently trusted producer digest unavailable' }
}
if ($TrustedSourceCommit -cne $env:GITHUB_SHA -or
    $TrustedProducerRunId -cne $env:GITHUB_RUN_ID -or
    $TrustedProducerRunAttempt -cne $env:GITHUB_RUN_ATTEMPT) {
    throw 'Protected producer outputs do not match the running GitHub source/attempt'
}
$artifact = Join-Path $runner 'scribe-installer-artifact'
if (-not (Test-Path -LiteralPath $artifact -PathType Container) -or
    ((Get-Item -LiteralPath $artifact -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Disposable candidate artifact directory missing or linked'
}
$files = @(Get-ChildItem -LiteralPath $artifact -File)
$installer = @($files | Where-Object { $_.Name -match '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$' })
$names = @('scribe-installer-candidate.json','Scribe.exe','PROVENANCE.json','DEPENDENCY-AUDIT.json')
if ($installer.Count -ne 1 -or $files.Count -ne 5) { throw 'Expected only four metadata/app files and one NSIS candidate' }
foreach ($name in @($installer[0].Name) + $names) {
    $inputFile = Get-Item -LiteralPath (Join-Path $artifact $name) -Force -ErrorAction Stop
    if (($inputFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $inputFile.PSIsContainer -or $inputFile.Length -le 0) {
        throw "Untrusted linked, missing or empty candidate file: $name"
    }
}
$userName = 's-smk-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$password = ConvertTo-SecureString ([guid]::NewGuid().ToString('N') + 'aA1!') -AsPlainText -Force
$scratch = Join-Path $runner ('standard-user-real-' + [guid]::NewGuid().ToString('N'))
$sid = $null
$resultReady = $false
$cleanupIssues = [Collections.Generic.List[string]]::new()
try {
    New-LocalUser -Name $userName -Password $password -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
    $account = Get-LocalUser -Name $userName
    $sid = $account.SID.Value
    $admins = @(Get-LocalGroupMember -Group 'Administrators' | ForEach-Object { $_.SID.Value })
    if ($sid -in $admins) { throw 'New test identity unexpectedly has administrator rights' }
    New-Item -ItemType Directory -Path $scratch -ErrorAction Stop | Out-Null
    $acl = Get-Acl -LiteralPath $scratch
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        [Security.Principal.SecurityIdentifier]::new($sid), 'Modify, Synchronize',
        'ContainerInherit,ObjectInherit','None','Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $scratch -AclObject $acl
    $scripts = Join-Path $scratch 'scripts'
    $candidate = Join-Path $scratch 'scribe-installer-artifact'
    New-Item -ItemType Directory -Path $scripts,$candidate -ErrorAction Stop | Out-Null
    foreach ($name in @('win-installer-smoke-guards.psm1','win-installer-candidate-trust.psm1',
                         'test-win-installer-smoke.ps1','run-win-installer-smoke-user-entry.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $scripts -ErrorAction Stop
    }
    foreach ($name in @($installer[0].Name) + $names) {
        Copy-Item -LiteralPath (Join-Path $artifact $name) -Destination $candidate -ErrorAction Stop
    }
    $credentials = [Management.Automation.PSCredential]::new("$env:COMPUTERNAME\$userName",$password)
    $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
    $entry = Join-Path $scripts 'run-win-installer-smoke-user-entry.ps1'
    $argsList = @(
        '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
        '-File',('"' + $entry + '"'),'-Scratch',('"' + $scratch + '"'),
        '-SourceSha',$env:GITHUB_SHA,'-RunId',$env:GITHUB_RUN_ID,
        '-RunAttempt',$env:GITHUB_RUN_ATTEMPT,
        '-TrustedManifestSha256',$TrustedManifestSha256,
        '-TrustedSourceCommit',$TrustedSourceCommit,
        '-TrustedProvenanceSha256',$TrustedProvenanceSha256,
        '-TrustedDependencyAuditSha256',$TrustedDependencyAuditSha256,
        '-TrustedProducerRunId',$TrustedProducerRunId,
        '-TrustedProducerRunAttempt',$TrustedProducerRunAttempt
    )
    $proc = Start-Process -FilePath $pwsh -ArgumentList $argsList -Credential $credentials -LoadUserProfile -PassThru -Wait -WindowStyle Hidden
    $summary = Join-Path $scratch 'scribe-installer-smoke-summary.json'
    if (-not (Test-Path -LiteralPath $summary -PathType Leaf)) {
        throw 'Disposable standard user did not produce a real installer summary'
    }
    $report = Get-Content -LiteralPath $summary -Raw | ConvertFrom-Json -ErrorAction Stop
    $reportDest = Join-Path $runner 'scribe-installer-smoke-result.json'
    Copy-Item -LiteralPath $summary -Destination $reportDest -ErrorAction Stop
    if ($env:GITHUB_STEP_SUMMARY) {
        Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value (
            '### Genuine disposable standard-user NSIS smoke' + [Environment]::NewLine +
            ($report | ConvertTo-Json -Depth 8)
        )
    }
    if ($proc.ExitCode -ne 0 -or $report.result -cne 'PASS' -or
        $report.steps.installerIntegrity -cne 'PASS' -or
        $report.steps.applicationExecutableIntegrity -cne 'PASS' -or
        $report.steps.perUserInstall -cne 'PASS' -or
        $report.steps.startMenuShortcut -cne 'PASS' -or
        $report.steps.uninstall -cne 'PASS' -or
        $report.steps.syntheticUserDataPreserved -cne 'PASS' -or
        $report.steps.cleanup -cne 'PASS') {
        throw 'Genuine standard-user install/shortcut/uninstall/preservation FAILED'
    }
    $resultReady = $true
} finally {
    if ($sid) {
        try {
            $user = Get-LocalUser -Name $userName -ErrorAction SilentlyContinue
            if ($user) { Remove-LocalUser -Name $userName -ErrorAction Stop }
            if (Get-LocalUser -Name $userName -ErrorAction SilentlyContinue) {
                $cleanupIssues.Add('Test account remains')
            }
        } catch { $cleanupIssues.Add("Account removal failed: $($_.Exception.Message)") }
        try {
            $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
            if ($profile -and $profile.Loaded) { $cleanupIssues.Add('Test profile remains loaded') }
            elseif ($profile) { $profile | Remove-CimInstance -ErrorAction Stop }
            if (Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue) {
                $cleanupIssues.Add('Disposable profile remains after removal')
            }
        } catch { $cleanupIssues.Add("Profile removal failed: $($_.Exception.Message)") }
    }
    if (Test-Path -LiteralPath $scratch) {
        try {
            $fullScratch = [IO.Path]::GetFullPath($scratch)
            if (-not $fullScratch.StartsWith(($runner + '\'),[StringComparison]::OrdinalIgnoreCase)) {
                throw 'Refusing cleanup outside RUNNER_TEMP'
            }
            Remove-Item -LiteralPath $fullScratch -Recurse -Force -ErrorAction Stop
            if (Test-Path -LiteralPath $scratch) { $cleanupIssues.Add('Scratch remains') }
        } catch { $cleanupIssues.Add("Scratch cleanup failed: $($_.Exception.Message)") }
    }
    if ($password) { $password.Dispose() }
    if ($cleanupIssues.Count -gt 0) { throw ('Hosted cleanup failure: ' + ($cleanupIssues -join '; ')) }
}
if (-not $resultReady) { throw 'Hosted installer acceptance not established' }
Write-Output 'Genuine normal-user NSIS install, shortcut, uninstall, synthetic preservation and cleanup PASS'
