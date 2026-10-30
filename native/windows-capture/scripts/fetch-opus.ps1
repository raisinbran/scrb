# Fetches libopus at the commit pinned in phase0/MANIFEST.md and builds it static.
$ErrorActionPreference = 'Stop'
$commit = '251d657e92fccfa3b05baec4f05756cce252fb75'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'third_party\opus'
if (-not (Test-Path "$src\.git")) {
    git init -q $src
    git -C $src remote add origin https://github.com/xiph/opus
}
if ((git -C $src rev-parse HEAD 2>$null) -ne $commit) {
    git -C $src fetch -q --depth 1 origin $commit
    git -C $src checkout -q $commit
}
$cmake = 'C:\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
$ninja = 'C:\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'
$bld = Join-Path $root 'build\opus'
$cfg = "call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && " +
    "`"$cmake`" -S `"$src`" -B `"$bld`" -G Ninja -DCMAKE_MAKE_PROGRAM=`"$ninja`" -DCMAKE_BUILD_TYPE=Release " +
    "-DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DCMAKE_POLICY_DEFAULT_CMP0091=NEW " +
    "-DOPUS_BUILD_SHARED_LIBRARY=OFF -DOPUS_BUILD_TESTING=OFF -DOPUS_BUILD_PROGRAMS=OFF >nul && " +
    "`"$cmake`" --build `"$bld`""
cmd /c $cfg
if ($LASTEXITCODE) { throw "libopus build failed: $LASTEXITCODE" }
"libopus $commit built: $bld\opus.lib"
