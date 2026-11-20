Set-StrictMode -Version Latest

function Test-SmokeIdentityFacts {
    param(
        [Parameter(Mandatory)] [bool] $IsSystem,
        [Parameter(Mandatory)] [bool] $IsAdministrator,
        [Parameter(Mandatory)] [string] $IdentityName,
        [Parameter(Mandatory)] [string] $IntegrityLevel
    )

    return (-not $IsSystem) -and (-not $IsAdministrator) -and
        ($IdentityName -notmatch 'CodexSandboxOffline') -and
        ($IntegrityLevel -eq 'Medium')
}

function Get-SmokeIdentityFacts {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $groups = & whoami.exe /groups /fo csv /nh 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the current token group list' }
    $integritySid = $null
    foreach ($line in $groups) {
        if ($line -match 'S-1-16-(\d+)') { $integritySid = $Matches[1] }
    }
    $integrity = switch ($integritySid) {
        '4096' { 'Low' }
        '8192' { 'Medium' }
        '8448' { 'MediumPlus' }
        '12288' { 'High' }
        '16384' { 'System' }
        default { 'Unknown' }
    }
    return [pscustomobject]@{
        IsSystem = $identity.IsSystem
        IsAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        IdentityName = $identity.Name
        IntegrityLevel = $integrity
    }
}

function Assert-SmokeIdentity {
    $facts = Get-SmokeIdentityFacts
    $factMap = @{
        IsSystem = $facts.IsSystem
        IsAdministrator = $facts.IsAdministrator
        IdentityName = $facts.IdentityName
        IntegrityLevel = $facts.IntegrityLevel
    }
    if (-not (Test-SmokeIdentityFacts @factMap)) {
        throw "Refusing smoke under identity '$($facts.IdentityName)' (administrator=$($facts.IsAdministrator), integrity=$($facts.IntegrityLevel), system=$($facts.IsSystem))"
    }
    return $facts
}

function Get-SmokeChildPath {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][string] $Parent)
    $childFull = [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $prefix = $parentFull + [IO.Path]::DirectorySeparatorChar
    if (-not $childFull.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$childFull' is outside disposable parent '$parentFull'"
    }
    return $childFull
}

function Assert-SmokeArtifact {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][string] $Parent,
        [Parameter(Mandatory)][string] $ExpectedName,
        [Parameter(Mandatory)][long] $ExpectedBytes,
        [Parameter(Mandatory)][string] $ExpectedSha256
    )
    $artifact = Get-SmokeChildPath -Path $Path -Parent $Parent
    if ([IO.Path]::GetFileName($artifact) -cne $ExpectedName -or -not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
        throw "Expected artifact '$ExpectedName' under the private artifact directory"
    }
    $info = Get-Item -LiteralPath $artifact
    if ($info.Length -ne $ExpectedBytes) { throw 'Artifact byte size does not match the pinned candidate' }
    $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -cne $ExpectedSha256.ToLowerInvariant()) { throw 'Artifact SHA-256 does not match the pinned candidate' }
    return $artifact
}

function Remove-SmokeChildPath {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][string] $Parent)
    $safePath = Get-SmokeChildPath -Path $Path -Parent $Parent
    if (Test-Path -LiteralPath $safePath) { Remove-Item -LiteralPath $safePath -Recurse -Force }
}

Export-ModuleMember -Function Test-SmokeIdentityFacts, Get-SmokeIdentityFacts, Assert-SmokeIdentity, Get-SmokeChildPath, Assert-SmokeArtifact, Remove-SmokeChildPath

