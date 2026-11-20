[CmdletBinding()]
param([Parameter(Mandatory)][string] $RunnerTemp)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Bootstrap is restricted to GitHub-hosted disposable runners' }
$parentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$parentPrincipal = [Security.Principal.WindowsPrincipal]::new($parentIdentity)
if ($parentIdentity.IsSystem -or -not $parentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Bootstrap must run in the hosted runner administrator context' }
$RunnerTemp = [IO.Path]::GetFullPath($RunnerTemp)
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
if (-not [string]::Equals($RunnerTemp.TrimEnd('\'), $runnerRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Bootstrap workspace must be exactly RUNNER_TEMP' }

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 12)
$userName = "s-smk-$suffix"
$scratch = Join-Path $RunnerTemp 'standard-user-test'
$securePassword = ConvertTo-SecureString ([guid]::NewGuid().ToString('N') + 'aA1!') -AsPlainText -Force
$account = $null
$exitCode = 1
try {
    New-LocalUser -Name $userName -Password $securePassword -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
    $account = Get-LocalUser -Name $userName
    $sid = $account.SID.Value
    $admins = Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop | ForEach-Object { $_.SID.Value }
    if ($sid -in $admins) { throw 'Temporary test account unexpectedly belongs to Administrators' }

    New-Item -ItemType Directory -Path $scratch | Out-Null
    $acl = Get-Acl -LiteralPath $scratch
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'Modify, Synchronize', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $scratch -AclObject $acl
    $scriptCopy = Join-Path $scratch 'scripts'
    New-Item -ItemType Directory -Path $scriptCopy | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'win-installer-smoke-guards.psm1') -Destination $scriptCopy
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'test-win-installer-smoke-guards.ps1') -Destination $scriptCopy

    $credential = [Management.Automation.PSCredential]::new("$env:COMPUTERNAME\$userName", $securePassword)
    $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $scriptCopy 'test-win-installer-smoke-guards.ps1'), '-RequireHostedStandardUser')
    $process = Start-Process -FilePath $pwsh -ArgumentList $arguments -Credential $credential -LoadUserProfile -PassThru -Wait -WindowStyle Hidden
    $exitCode = $process.ExitCode
    if ($exitCode -ne 0) { throw "Standard-user behavioral guard probe failed with exit code $exitCode" }

} finally {
    if ($account) { Remove-LocalUser -Name $userName -ErrorAction SilentlyContinue }
    if ($sid) {
        $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
        if ($profile -and -not $profile.Loaded) { $profile | Remove-CimInstance -ErrorAction SilentlyContinue }
        $remainingProfile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
        if ($remainingProfile) { throw 'Temporary standard-user profile could not be removed safely' }
    }
    if (Test-Path -LiteralPath $scratch) {
        $fullScratch = [IO.Path]::GetFullPath($scratch)
        if (-not $fullScratch.StartsWith(($RunnerTemp.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside RUNNER_TEMP' }
        Remove-Item -LiteralPath $fullScratch -Recurse -Force
    }
    $securePassword.Dispose()
}
if ($exitCode -ne 0) { exit $exitCode }
Write-Output 'Disposable hosted standard-user bootstrap and behavioral checks PASS'

