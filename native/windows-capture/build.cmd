@echo off
rem Requires Node 22 and scripts\fetch-opus.ps1 once. Output: build\bin\
if not defined SCRB_VCVARS64 set "SCRB_VCVARS64=C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%SCRB_VCVARS64%" (
  echo Visual C++ x64 environment is missing: %SCRB_VCVARS64%
  exit /b 1
)
call "%SCRB_VCVARS64%" >nul
cd /d %~dp0
if not exist build\bin mkdir build\bin
if not exist build\obj mkdir build\obj
set CF=/nologo /EHsc /O2 /MD /std:c++17 /W3 /DNOMINMAX /Ithird_party\opus\include /Fobuild\obj\
cl %CF% tests\PipelineTests.cpp src\TrackPipeline.cpp src\LivePcmFeed.cpp /Fe:build\bin\PipelineTests.exe || exit /b 1
cl %CF% tests\LivePcmTests.cpp src\TrackPipeline.cpp src\LivePcmFeed.cpp /Fe:build\bin\LivePcmTests.exe || exit /b 1
cl %CF% src\main.cpp src\MicProbe.cpp src\Session.cpp src\Track.cpp src\TrackPipeline.cpp src\LivePcmFeed.cpp src\ChunkStore.cpp build\opus\Release\opus.lib /Fe:build\bin\scrb-capture.exe || exit /b 1
cl %CF% tests\ChunkVerify.cpp build\opus\Release\opus.lib /Fe:build\bin\ChunkVerify.exe || exit /b 1
node "%~dp0..\..\scripts\write-win-capture-build-manifest.mjs" --repo "%~dp0..\.." --capture-bin "%~dp0build\bin\scrb-capture.exe" --capture-source "%~dp0src" --build-script "%~dp0build.cmd" --opus-source "%~dp0third_party\opus" --opus-lib "%~dp0build\opus\Release\opus.lib" --out "%~dp0build\capture-build-manifest.json" || exit /b 1
