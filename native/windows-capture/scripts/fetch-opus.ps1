# Fetches libopus at the commit pinned in third_party/MANIFEST.md and builds it static.
$ErrorActionPreference = 'Stop'
$commit = '251d657e92fccfa3b05baec4f05756cce252fb75'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'third_party\opus'
if (-not (Test-Path "$src\.git")) {
    git init -q $src
    git -C $src remote add origin https://github.com/xiph/opus
}
# A fresh `git init` has no commits, so HEAD does not exist yet: -q keeps git silent and the exit code decides.
$head = git -C $src rev-parse --verify -q HEAD
if ($LASTEXITCODE -ne 0) { $head = $null }
if ($head -ne $commit) {
    git -C $src fetch -q --depth 1 origin $commit
    if ($LASTEXITCODE) { throw "libopus fetch failed (git exit $LASTEXITCODE). Check the network and that $src\.git is writable, then run this again." }
    git -C $src checkout -q $commit
    if ($LASTEXITCODE) { throw "libopus checkout of $commit failed (git exit $LASTEXITCODE)." }
}
$cmake = $env:SCRB_CMAKE_EXE
if (-not $cmake) {
    $cmakeCommand = Get-Command cmake.exe -ErrorAction SilentlyContinue
    if ($cmakeCommand) { $cmake = $cmakeCommand.Source }
}
if (-not $cmake -or -not (Test-Path -LiteralPath $cmake -PathType Leaf)) {
    throw 'CMake is required; install Visual Studio C++ tools or set SCRB_CMAKE_EXE.'
}
# Match the installed MSVC toolset; hosted runners may have VS 2026 rather than VS 2022.
$vsRoot = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if (-not $vsRoot) { throw 'ProgramFiles(x86) is unavailable for Visual Studio discovery.' }
$vswhere = Join-Path $vsRoot 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'vswhere.exe is required to select the installed CMake generator.' }
$vsVersionString = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationVersion)
if ($LASTEXITCODE -ne 0 -or -not $vsVersionString) { throw 'An installed Visual Studio C++ x64 toolchain is required.' }
$vsVersion = [version]($vsVersionString.Trim())
$generator = switch ($vsVersion.Major) {
    17 { 'Visual Studio 17 2022' }
    18 { 'Visual Studio 18 2026' }
    default { throw "Unsupported Visual Studio major version $($vsVersion.Major)." }
}
$generatorHelp = (& $cmake --help) -join "`n"
if ($LASTEXITCODE -ne 0 -or -not $generatorHelp.Contains($generator)) {
    throw "Selected CMake does not support installed toolchain generator $generator."
}
$bld = Join-Path $root 'build\opus'
& $cmake -S $src -B $bld -G $generator -A x64 `
    '-DCMAKE_POLICY_VERSION_MINIMUM=3.5' `
    -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL `
    -DCMAKE_POLICY_DEFAULT_CMP0091=NEW `
    -DOPUS_BUILD_SHARED_LIBRARY=OFF `
    -DOPUS_BUILD_TESTING=OFF `
    -DOPUS_BUILD_PROGRAMS=OFF
if ($LASTEXITCODE) { throw "libopus configuration failed: $LASTEXITCODE" }
& $cmake --build $bld --config Release
if ($LASTEXITCODE) { throw "libopus build failed: $LASTEXITCODE" }
"libopus $commit built: $bld\Release\opus.lib"
