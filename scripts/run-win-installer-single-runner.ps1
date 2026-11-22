# Same-runner, zero-upload Windows NSIS smoke. Not an independent cross-job attestation.
[CmdletBinding()]
param(
    [ValidateSet('Preflight','Prepare','Consume','Cleanup')][string]$Mode,
    [string]$ExpectedSourceSha,
    [string]$OutputRoot,
    [string]$TrustedManifestSha256,
    [string]$TrustedSourceCommit,
    [string]$TrustedProvenanceSha256,
    [string]$TrustedDependencyAuditSha256,
    [string]$TrustedProducerRunId,
    [string]$TrustedProducerRunAttempt
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-SingleRunnerDispatchFacts {
    param([Parameter(Mandatory)][hashtable]$Facts)
    $expectedRef = 'raisinbran/scrb/.github/workflows/windows-installer-single-runner-smoke.yml@refs/heads/main'
    return ($Facts.Actions -ceq 'true' -and
        $Facts.Runner -ceq 'github-hosted' -and
        $Facts.Event -ceq 'workflow_dispatch' -and
        $Facts.Repository -ceq 'raisinbran/scrb' -and
        $Facts.Actor -ceq 'raisinbran' -and
        $Facts.TriggeringActor -ceq 'raisinbran' -and
        $Facts.Ref -ceq 'refs/heads/main' -and
        $Facts.WorkflowRef -ceq $expectedRef -and
        $Facts.Job -ceq 'verified-installer-producer' -and
        $Facts.Attempt -ceq '1' -and
        $Facts.BuildOptIn -ceq 'true' -and
        $Facts.NoUploadOptIn -ceq 'true' -and
        $Facts.Sha -cmatch '^[a-f0-9]{40}$' -and
        $Facts.ExpectedSha -ceq $Facts.Sha)
}

function Get-SingleRunnerFacts {
    param([string]$Expected)
    return @{
        Actions = $env:GITHUB_ACTIONS
        Runner = $env:RUNNER_ENVIRONMENT
        Event = $env:GITHUB_EVENT_NAME
        Repository = $env:GITHUB_REPOSITORY
        Actor = $env:GITHUB_ACTOR
        TriggeringActor = $env:GITHUB_TRIGGERING_ACTOR
        Ref = $env:GITHUB_REF
        WorkflowRef = $env:GITHUB_WORKFLOW_REF
        Job = $env:GITHUB_JOB
        Attempt = $env:GITHUB_RUN_ATTEMPT
        BuildOptIn = $env:SCRIBE_GENUINE_BUILD_OPT_IN
        NoUploadOptIn = $env:SCRIBE_NO_UPLOAD_OPT_IN
        Sha = $env:GITHUB_SHA
        ExpectedSha = $Expected
    }
}

function Assert-SingleRunnerRoot {
    param([Parameter(Mandatory)][string]$Path)
    if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
        throw 'No isolated hosted runner temporary directory'
    }
    $runner = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\','/')
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    if (-not [string]::Equals([IO.Path]::GetDirectoryName($full), $runner,
            [StringComparison]::OrdinalIgnoreCase) -or
        ((Get-Item -LiteralPath $runner -Force).Attributes -band
            [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Candidate root must be a direct child of RUNNER_TEMP'
    }
    return $full
}

function Assert-SingleRunnerFileSet {
    param([Parameter(Mandatory)][string]$Root)
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        throw 'No job-local candidate exists'
    }
    $dir = Get-Item -LiteralPath $Root -Force
    if (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Candidate root is a link'
    }
    $entries = @(Get-ChildItem -LiteralPath $Root -Force)
    $installers = @($entries | Where-Object {
        $_.Name -cmatch '^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$'
    })
    if ($entries.Count -ne 5 -or $installers.Count -ne 1) {
        throw 'Candidate requires exactly five regular files'
    }
    $names = @($installers[0].Name,'Scribe.exe','scribe-installer-candidate.json',
                'PROVENANCE.json','DEPENDENCY-AUDIT.json')
    foreach ($entry in $entries) {
        if ($names -cnotcontains $entry.Name -or $entry.PSIsContainer -or
            ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
            $entry.Length -le 0 -or $entry.Length -gt 2147483648) {
            throw 'Candidate has an unexpected, linked, empty or oversized file'
        }
    }
    foreach ($name in $names) {
        if (@($entries | Where-Object { $_.Name -ceq $name }).Count -ne 1) {
            throw 'Candidate file name is missing, duplicated or noncanonical'
        }
    }
    return $installers[0].FullName
}

function Assert-SingleRunnerEvidence {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$ManifestSha,
        [Parameter(Mandatory)][string]$SourceSha,
        [Parameter(Mandatory)][string]$ProvenanceSha,
        [Parameter(Mandatory)][string]$AuditSha,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$Attempt
    )
    Import-Module (Join-Path $PSScriptRoot 'win-installer-candidate-trust.psm1') -Force
    $installer = Assert-SingleRunnerFileSet -Root $Root
    # Values below came from steps.package.outputs IN THIS JOB, not a separate
    # protected producer. They establish only same-run integrity/consistency.
    $candidate = Assert-TrustedCandidate -CandidateManifestPath (Join-Path $Root 'scribe-installer-candidate.json') -InstallerPath $installer -ArtifactRoot $Root -TrustedManifestSha256 $ManifestSha -TrustedSourceCommit $SourceSha -TrustedProvenanceSha256 $ProvenanceSha -TrustedDependencyAuditSha256 $AuditSha -TrustedProducerRunId $RunId -TrustedProducerRunAttempt $Attempt
    if (-not $candidate -or $candidate.SourceCommit -cne $env:GITHUB_SHA) {
        throw 'Job-local candidate integrity cannot be established'
    }
    return $candidate
}

if ($Mode) {
    if (-not (Test-SingleRunnerDispatchFacts (Get-SingleRunnerFacts $ExpectedSourceSha))) {
        throw 'REFUSED: invalid actor, trigger, workflow, source, attempt or owner opt-in'
    }
    $repo = Split-Path -Parent $PSScriptRoot
    if ($Mode -ne 'Cleanup') {
        $gitHead = (& git -C $repo rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or $gitHead -cne $ExpectedSourceSha) {
            throw 'REFUSED: checked-out source differs from authorized main commit'
        }
        # Block before a costly seven-tool build unless the separately reviewed
        # and owner-merged #424 readiness implementation is present on main.
        $smokePath = Join-Path $PSScriptRoot 'test-win-installer-smoke.ps1'
        $parentPath = Join-Path $PSScriptRoot 'run-win-installer-smoke-real-standard-user.ps1'
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'win-installed-app-readiness.psm1')) -or
            -not ((Get-Content -LiteralPath $smokePath -Raw).Contains('applicationLaunchReady')) -or
            -not ((Get-Content -LiteralPath $parentPath -Raw).Contains('applicationLaunchReady'))) {
            throw 'BLOCKED: reviewed and merged #424 GUI readiness dependency unavailable'
        }
    }
    $candidateRoot = Assert-SingleRunnerRoot (Join-Path $env:RUNNER_TEMP 'scribe-installer-artifact')
    $installerOutput = Assert-SingleRunnerRoot (Join-Path $env:RUNNER_TEMP 'scribe-no-upload-nsis')
    switch ($Mode) {
        'Preflight' {
            $clock = Join-Path $env:RUNNER_TEMP 'scribe-no-upload-start.txt'
            if (Test-Path -LiteralPath $clock) { throw 'Refusing previously started run' }
            [IO.File]::WriteAllText($clock, [DateTime]::UtcNow.ToString('o'))
            Write-Output 'PASS: owner/main/exact-head/first-attempt/no-upload and GUI dependency gates'
        }
        'Prepare' {
            $clock = Join-Path $env:RUNNER_TEMP 'scribe-no-upload-start.txt'
            if (-not (Test-Path -LiteralPath $clock)) { throw 'Missing bounded build start' }
            $elapsed = [DateTime]::UtcNow - [DateTime]::Parse((Get-Content -LiteralPath $clock -Raw))
            if ($elapsed.TotalMinutes -ge 105) { throw 'Producer exceeded 105-minute budget' }
            if (-not [string]::Equals([IO.Path]::GetFullPath($OutputRoot).TrimEnd('\','/'), $installerOutput,
                    [StringComparison]::OrdinalIgnoreCase)) { throw 'NSIS output root mismatch' }
            if (Test-Path -LiteralPath $candidateRoot) { throw 'Refusing reused candidate directory' }
            $installers = @(Get-ChildItem -LiteralPath $installerOutput -Force -File -Filter 'Scribe Setup *.exe')
            if ($installers.Count -ne 1) { throw 'Expected precisely one locally built NSIS installer' }
            $stage = Join-Path $repo 'apps/desktop/build/win-stage/bin'
            $unpacked = Join-Path $repo 'apps/desktop/release/win-unpacked'
            $files = @($installers[0].FullName,(Join-Path $unpacked 'Scribe.exe'),
                       (Join-Path $installerOutput 'scribe-installer-candidate.json'),
                       (Join-Path $stage 'PROVENANCE.json'),
                       (Join-Path $stage 'DEPENDENCY-AUDIT.json'))
            New-Item -ItemType Directory -Path $candidateRoot -ErrorAction Stop | Out-Null
            foreach ($file in $files) {
                if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or
                    ((Get-Item -LiteralPath $file -Force).Attributes -band
                        [IO.FileAttributes]::ReparsePoint) -ne 0) {
                    throw 'Source candidate file missing or linked'
                }
                Copy-Item -LiteralPath $file -Destination $candidateRoot -ErrorAction Stop
            }
            $null = Assert-SingleRunnerEvidence -Root $candidateRoot -ManifestSha $TrustedManifestSha256 -SourceSha $TrustedSourceCommit -ProvenanceSha $TrustedProvenanceSha256 -AuditSha $TrustedDependencyAuditSha256 -RunId $TrustedProducerRunId -Attempt $TrustedProducerRunAttempt
            Write-Output 'PASS: exactly five job-local candidate files and manifest/provenance consistency'
        }
        'Consume' {
            $candidate = Assert-SingleRunnerEvidence -Root $candidateRoot -ManifestSha $TrustedManifestSha256 -SourceSha $TrustedSourceCommit -ProvenanceSha $TrustedProvenanceSha256 -AuditSha $TrustedDependencyAuditSha256 -RunId $TrustedProducerRunId -Attempt $TrustedProducerRunAttempt
            & (Join-Path $PSScriptRoot 'run-win-installer-smoke-real-standard-user.ps1') -RunnerTemp $env:RUNNER_TEMP -TrustedManifestSha256 $TrustedManifestSha256 -TrustedSourceCommit $TrustedSourceCommit -TrustedProvenanceSha256 $TrustedProvenanceSha256 -TrustedDependencyAuditSha256 $TrustedDependencyAuditSha256 -TrustedProducerRunId $TrustedProducerRunId -TrustedProducerRunAttempt $TrustedProducerRunAttempt
            # The called PowerShell script throws on failure; LASTEXITCODE is not
            # a reliable signal for PowerShell-to-PowerShell invocation.
            $summaryPath = Join-Path $env:RUNNER_TEMP 'scribe-installer-smoke-result.json'
            if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) {
                throw 'No genuine disposable-user result'
            }
            $report = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json -ErrorAction Stop
            if ($report.result -cne 'PASS' -or $report.scribeLaunched -ne $true -or
                $report.steps.applicationLaunchReady -cne 'PASS' -or
                $report.installedAppReadiness.result -cne 'PASS' -or
                $report.installedAppReadiness.cleanExit -cne 'PASS') {
                throw 'Installed GUI readiness or controlled exit NOT VERIFIED'
            }
            Write-Output 'PASS: genuine standard-user install, renderer GUI ready, clean exit and uninstall'
        }
        'Cleanup' {
            $errors = [Collections.Generic.List[string]]::new()
            foreach ($directory in @($candidateRoot,$installerOutput)) {
                try {
                    if (Test-Path -LiteralPath $directory) {
                        $item = Get-Item -LiteralPath $directory -Force -ErrorAction Stop
                        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                            throw 'Refusing cleanup through a linked root'
                        }
                        Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction Stop
                        if (Test-Path -LiteralPath $directory) { throw 'Owned scratch remains' }
                    }
                } catch { $errors.Add('Owned scratch cleanup failed') }
            }
            # Owned metadata is also scratch; preserve only sanitized step summaries.
            foreach ($name in @('scribe-public-source-evidence.json',
                                'scribe-no-upload-start.txt',
                                'scribe-installer-smoke-result.json',
                                'scribe-installed-app-readiness.json')) {
                $file = Join-Path $env:RUNNER_TEMP $name
                try {
                    if (Test-Path -LiteralPath $file) {
                        $item = Get-Item -LiteralPath $file -Force -ErrorAction Stop
                        if ($item.PSIsContainer -or
                            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                            throw 'Refusing unexpected or linked scratch evidence'
                        }
                        Remove-Item -LiteralPath $file -Force -ErrorAction Stop
                        if (Test-Path -LiteralPath $file) { throw 'Owned metadata remains' }
                    }
                } catch { $errors.Add('Owned metadata cleanup failed') }
            }
            if ($errors.Count) { throw ($errors -join '; ') }
            Write-Output 'PASS: job-local NSIS output, candidate and metadata scratch removed'
        }
    }
}
