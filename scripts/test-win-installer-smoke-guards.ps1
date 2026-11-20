[CmdletBinding()]
param([switch] $RequireHostedStandardUser)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'win-installer-smoke-guards.psm1') -Force

function Assert-Throws([scriptblock] $Action, [string] $Label) {
    $threw = $false
    try { & $Action } catch { $threw = $true }
    if (-not $threw) { throw "Negative guard test did not reject: $Label" }
}

if ($RequireHostedStandardUser) {
    $facts = Assert-SmokeIdentity
    Write-Output "Hosted standard-user identity PASS: $($facts.IdentityName), integrity=$($facts.IntegrityLevel)"
}

$valid = @{ IsSystem = $false; IsAdministrator = $false; IdentityName = 'RUNNER\smoke-user'; IntegrityLevel = 'Medium' }
if (-not (Test-SmokeIdentityFacts @valid)) { throw 'Valid standard-user facts were rejected' }
foreach ($case in @(
    @{ Name = 'administrator'; Facts = $valid.Clone() },
    @{ Name = 'system'; Facts = $valid.Clone() },
    @{ Name = 'restricted Codex identity'; Facts = $valid.Clone() },
    @{ Name = 'high integrity'; Facts = $valid.Clone() }
)) {
    switch ($case.Name) {
        'administrator' { $case.Facts.IsAdministrator = $true }
        'system' { $case.Facts.IsSystem = $true }
        'restricted Codex identity' { $case.Facts.IdentityName = 'CodexSandboxOffline\user' }
        'high integrity' { $case.Facts.IntegrityLevel = 'High' }
    }
    $caseFacts = $case.Facts
    if (Test-SmokeIdentityFacts -IsSystem $caseFacts.IsSystem -IsAdministrator $caseFacts.IsAdministrator -IdentityName $caseFacts.IdentityName -IntegrityLevel $caseFacts.IntegrityLevel) {
        throw "Identity guard accepted $($case.Name)"
    }
}

$sandbox = Join-Path $PSScriptRoot ('.scribe-guard-tests-' + [guid]::NewGuid().ToString('N'))
$parent = Join-Path $sandbox 'artifact'
$cleanup = Join-Path $sandbox 'cleanup'
New-Item -ItemType Directory -Path $parent, $cleanup -Force | Out-Null
try {
    $fixture = Join-Path $parent 'fixture.exe'
    [IO.File]::WriteAllBytes($fixture, [byte[]](1, 2, 3, 4))
    $fixtureHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
    Assert-SmokeArtifact -Path $fixture -Parent $parent -ExpectedName 'fixture.exe' -ExpectedBytes 4 -ExpectedSha256 $fixtureHash | Out-Null
    Assert-Throws { Assert-SmokeArtifact -Path $fixture -Parent $parent -ExpectedName 'fixture.exe' -ExpectedBytes 5 -ExpectedSha256 $fixtureHash } 'wrong artifact size'
    Assert-Throws { Assert-SmokeArtifact -Path $fixture -Parent $parent -ExpectedName 'fixture.exe' -ExpectedBytes 4 -ExpectedSha256 ('0' * 64) } 'wrong artifact hash'
    Assert-Throws { Get-SmokeChildPath -Path $sandbox -Parent $parent | Out-Null } 'parent path escape'
    Assert-Throws { Remove-SmokeChildPath -Path $sandbox -Parent $cleanup } 'cleanup parent escape'
    $victim = Join-Path $sandbox 'preserve-me.txt'
    Set-Content -LiteralPath $victim -Value 'must survive'
    Assert-Throws { Remove-SmokeChildPath -Path $victim -Parent $cleanup } 'cleanup outside path'
    if (-not (Test-Path -LiteralPath $victim)) { throw 'Rejected cleanup path removed an outside fixture' }
    $owned = Join-Path $cleanup 'owned'
    New-Item -ItemType Directory -Path $owned | Out-Null
    Set-Content -LiteralPath (Join-Path $owned 'owned.txt') -Value 'delete me'
    Remove-SmokeChildPath -Path $owned -Parent $cleanup
    if (Test-Path -LiteralPath $owned) { throw 'Cleanup did not remove its owned child path' }
} finally {
    $safeSandbox = Get-SmokeChildPath -Path $sandbox -Parent $PSScriptRoot
    Remove-Item -LiteralPath $safeSandbox -Recurse -Force -ErrorAction Stop
}

Write-Output 'Windows installer smoke guard behavior PASS'

