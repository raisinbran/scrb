# Seven-tool public-source producer; never consumes private W10/M5 binaries or models.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StagingDirectory,
      [Parameter(Mandatory)][string]$SourceEvidenceFile)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path -Parent $PSScriptRoot
$sourceCommit = (& git -C $repo rev-parse HEAD).Trim()
if ($env:GITHUB_ACTIONS -cne 'true' -or
    $env:GITHUB_EVENT_NAME -cne 'workflow_dispatch' -or
    $env:GITHUB_JOB -cne 'verified-installer-producer' -or
    $env:GITHUB_REPOSITORY -cne 'raisinbran/scrb' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    $env:GITHUB_SHA -cnotmatch '^[a-f0-9]{40}$' -or
    $sourceCommit -cne $env:GITHUB_SHA -or
    [string]::IsNullOrEmpty($env:RUNNER_TEMP)) {
    throw 'Public source builder requires the exact trusted hosted producer dispatch'
}
$work = Join-Path $env:RUNNER_TEMP ('scrb-public-src-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
$whisperPin = '284029c07012d2000941a08d38a31ffb71f4734e'
$sherpaPin = '11fd6a50b97eed38b54fb16d8219f49b16aa7f6a8e43a042316469ef47652e82'
$ffmpegPin = '7f607a00dd0d28a729d5a4811205812eef01cf6ef6155025febb6f36a9062d52'
$opusPin = '6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1'
$vsRoot = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$vswhere = Join-Path $vsRoot 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'VS toolchain locator missing' }
$visualStudio = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if (-not $visualStudio -or -not (Test-Path -LiteralPath (Join-Path $visualStudio 'VC\Auxiliary\Build\vcvars64.bat'))) {
    throw 'Hosted Visual Studio C++ x64 tools unavailable'
}
$alias = 'C:\BuildTools'
if (Test-Path -LiteralPath $alias) { throw 'Refusing to replace existing C:\BuildTools' }
$created = $false
function Assert-Exit([string]$Label) { if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit $LASTEXITCODE" } }
function Get-Sha([string]$File) {
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "Missing required build file: $File" }
    (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Invoke-Download([string]$Uri, [string]$Out, [string]$Expected) {
    Invoke-WebRequest -Uri $Uri -OutFile $Out -UseBasicParsing -ErrorAction Stop
    if ((Get-Sha $Out) -cne $Expected) { throw "Pinned public source SHA-256 mismatch: $Out" }
}
function Invoke-Msvc([string]$Command) {
    & cmd.exe /d /c ('call "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul && ' + $Command)
    Assert-Exit 'MSVC command'
}
try {
    New-Item -ItemType Junction -Path $alias -Target $visualStudio -ErrorAction Stop | Out-Null
    $created = $true
    $cm = 'C:\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
    $nj = 'C:\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'
    if (-not (Test-Path -LiteralPath $cm) -or -not (Test-Path -LiteralPath $nj)) {
        throw 'Visual Studio bundled CMake/Ninja missing'
    }
    $whisper = Join-Path $work 'whisper.cpp'
    & git init -q $whisper; Assert-Exit 'whisper git init'
    & git -C $whisper remote add origin https://github.com/ggml-org/whisper.cpp
    Assert-Exit 'whisper origin'
    & git -C $whisper fetch --depth 1 origin $whisperPin
    Assert-Exit 'pinned Whisper fetch'
    & git -C $whisper checkout --detach $whisperPin
    Assert-Exit 'pinned Whisper checkout'
    if ((& git -C $whisper rev-parse HEAD).Trim() -cne $whisperPin) { throw 'Whisper source differs from pinned commit' }
    $whisperBuild = Join-Path $whisper 'build'
    Invoke-Msvc ('"' + $cm + '" -S "' + $whisper + '" -B "' + $whisperBuild + '" -G Ninja -DCMAKE_MAKE_PROGRAM="' +
        $nj + '" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF')
    Invoke-Msvc ('"' + $cm + '" --build "' + $whisperBuild + '" --parallel 4')
    $whisperBin = Join-Path $whisperBuild 'bin'
    foreach ($name in @('whisper-cli.exe','whisper-server.exe','whisper-vad-speech-segments.exe')) {
        [void](Get-Sha (Join-Path $whisperBin $name))
    }

    $archive = Join-Path $work 'sherpa-onnx-v2.0.1.tar.bz2'
    Invoke-Download 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-v2.0.1-win-x64-shared-MD-Release-no-tts.tar.bz2' $archive $sherpaPin
    & tar.exe -xjf $archive -C $work
    Assert-Exit 'pinned Sherpa extraction'
    $release = Get-ChildItem -LiteralPath $work -Directory | Where-Object {
        $_.Name -like 'sherpa-onnx-v2.0.1*'
    } | Select-Object -First 1
    if (-not $release) { throw 'Verified Sherpa release directory missing' }
    $include = Join-Path $release.FullName 'include'
    if (-not (Test-Path -LiteralPath (Join-Path $include 'sherpa-onnx\c-api\c-api.h'))) {
        throw 'Verified Sherpa C API headers missing'
    }
    $importLib = Get-ChildItem -LiteralPath $release.FullName -Recurse -File -Filter 'sherpa-onnx-c-api.lib' |
        Select-Object -First 1
    if (-not $importLib) { throw 'Sherpa C API import library missing' }
    $sherpaBin = Join-Path $work 'sherpa-bin'
    $sherpaLib = Join-Path $work 'sherpa-lib'
    New-Item -ItemType Directory -Path $sherpaBin, $sherpaLib -ErrorAction Stop | Out-Null
    $wrapperExe = Join-Path $sherpaBin 'scrb-sherpa.exe'
    $wrapperSrc = Join-Path $repo 'packages\transcription\native\scrb-sherpa.cpp'
    Invoke-Msvc ('cl /nologo /EHsc /O2 /MD /std:c++17 /I"' + $include +
        '" "' + $wrapperSrc + '" "' + $importLib.FullName + '" /Fe:"' + $wrapperExe + '"')
    [void](Get-Sha $wrapperExe)
    foreach ($name in @('sherpa-onnx-c-api.dll','onnxruntime.dll','onnxruntime_providers_shared.dll')) {
        $file = Get-ChildItem -LiteralPath $release.FullName -Recurse -File -Filter $name |
            Select-Object -First 1
        if (-not $file) { throw "Verified Sherpa distribution missing $name" }
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $sherpaLib $name)
    }

    $ffmpegBin = Join-Path $repo 'packages\transcription\.bin'
    if (Test-Path -LiteralPath (Join-Path $ffmpegBin 'ffmpeg.exe')) {
        throw 'Refusing existing FFmpeg binary in a hosted public-source build'
    }
    $bash = 'C:\msys64\usr\bin\bash.exe'
    if (-not (Test-Path -LiteralPath $bash)) { throw 'GitHub-hosted MSYS2 UCRT64 unavailable' }
    $env:MSYSTEM = 'UCRT64'
    $env:CHERE_INVOKING = '1'
    & $bash -lc 'pacman -S --noconfirm --needed mingw-w64-ucrt-x86_64-gcc make diffutils nasm xz curl'
    Assert-Exit 'MSYS2 toolchain'
    & $bash -lc 'bash packages/transcription/scripts/build-ffmpeg.sh'
    Assert-Exit 'pinned FFmpeg/libopus source build'
    $ffwork = Join-Path $repo 'packages\transcription\.work\ffmpeg'
    if ((Get-Sha (Join-Path $ffwork 'ffmpeg-9.0.tar.xz')) -cne $ffmpegPin -or
        (Get-Sha (Join-Path $ffwork 'opus-1.6.1.tar.gz')) -cne $opusPin) {
        throw 'FFmpeg/libopus source archive digest mismatch'
    }
    $ffmpegHashes = @{}
    foreach ($name in @('ffmpeg.exe','ffprobe.exe')) {
        $ffmpegHashes[$name] = Get-Sha (Join-Path $ffmpegBin $name)
    }

    # Original build.cmd and fetch-opus.ps1 remain the source of capture compile flags.
    & (Join-Path $repo 'native\windows-capture\scripts\fetch-opus.ps1')
    Assert-Exit 'pinned capture opus'
    & cmd.exe /d /c ('"' + (Join-Path $repo 'native\windows-capture\build.cmd') + '"')
    Assert-Exit 'source-identified capture build'
    $captureBin = Join-Path $repo 'native\windows-capture\build\bin\scrb-capture.exe'
    [void](Get-Sha $captureBin)

    # A new hosted VS version must not masquerade as the historic W10 runtime hashes.
    # Verify each runtime has a valid Microsoft Authenticode signature first.
    $runtimeHashes = @{}
    $runtimeDirs = [Collections.Generic.List[string]]::new()
    foreach ($name in @('msvcp140.dll','msvcp140_1.dll','vcomp140.dll',
                         'vcruntime140.dll','vcruntime140_1.dll')) {
        $dll = Get-ChildItem -Path 'C:\BuildTools\VC\Redist\MSVC' -Recurse -File -Filter $name |
            Where-Object { $_.FullName -match '\\x64\\' } |
            Sort-Object FullName -Descending | Select-Object -First 1
        if (-not $dll) { throw "Microsoft redistributable missing $name" }
        $signature = Get-AuthenticodeSignature -LiteralPath $dll.FullName
        if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
            $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
            throw "MSVC runtime signature not trusted: $name"
        }
        $runtimeHashes[$name] = Get-Sha $dll.FullName
        if (-not $runtimeDirs.Contains($dll.Directory.FullName)) {
            $runtimeDirs.Add($dll.Directory.FullName)
        }
    }
    $evidence = [ordered]@{
        schemaVersion = 1
        sourceCommit = $env:GITHUB_SHA
        runId = $env:GITHUB_RUN_ID
        ffmpegArchiveSha256 = $ffmpegPin
        opusArchiveSha256 = $opusPin
        ffmpegBinaries = $ffmpegHashes
        runtimeHashes = $runtimeHashes
    }
    $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $SourceEvidenceFile -Encoding utf8
    $dumpbin = Get-ChildItem -Path 'C:\BuildTools\VC\Tools\MSVC' -Recurse -File -Filter 'dumpbin.exe' |
        Where-Object { $_.FullName -match '\\Hostx64\\x64\\' } |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $dumpbin) { throw 'MSVC x64 dumpbin missing' }
    $argsList = @(
        (Join-Path $repo 'scripts\stage-win-tools.mjs'),
        '--repo', $repo,
        '--out', $StagingDirectory,
        '--whisper-bin', $whisperBin,
        '--whisper-source', $whisper,
        '--sherpa-bin', $sherpaBin,
        '--sherpa-lib', $sherpaLib,
        '--sherpa-archive', $archive,
        '--ffmpeg-bin', $ffmpegBin,
        '--dumpbin', $dumpbin.FullName,
        '--capture-bin', $captureBin,
        '--hosted-source-evidence', $SourceEvidenceFile
    )
    foreach ($directory in $runtimeDirs) { $argsList += @('--runtime-dir', $directory) }
    & node @argsList
    Assert-Exit 'seven-tool closure staging'
    Write-Host 'Hosted pinned public-source seven-tool build and closure PASS'
} finally {
    if ($created -and (Test-Path -LiteralPath $alias)) {
        $item = Get-Item -LiteralPath $alias -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
            throw 'Refusing to remove a non-junction toolchain path'
        }
        & cmd.exe /d /c 'rmdir C:\BuildTools'
        Assert-Exit 'toolchain junction removal'
    }
}
