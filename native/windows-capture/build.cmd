@echo off
rem Requires scripts\fetch-opus.ps1 once.  Output: build\bin\
call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul
cd /d %~dp0
if not exist build\bin mkdir build\bin
if not exist build\obj mkdir build\obj
set CF=/nologo /EHsc /O2 /MD /std:c++17 /W3 /DNOMINMAX /Ithird_party\opus\include /Fobuild\obj\
cl %CF% tests\PipelineTests.cpp src\TrackPipeline.cpp /Fe:build\bin\PipelineTests.exe || exit /b 1
cl %CF% src\main.cpp src\Session.cpp src\Track.cpp src\TrackPipeline.cpp src\ChunkStore.cpp build\opus\opus.lib /Fe:build\bin\scrb-capture.exe || exit /b 1
cl %CF% tests\ChunkVerify.cpp build\opus\opus.lib /Fe:build\bin\ChunkVerify.exe || exit /b 1
