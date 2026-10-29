@echo off
call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul
cd /d %~dp0
set OPUS=%~dp0..\..\upstream\opus
cl /nologo /EHsc /O2 /std:c++17 /W3 /D_CRT_SECURE_NO_WARNINGS /I"%OPUS%\include" OpusStorage.cpp /link "%OPUS%\build\opus.lib" /out:OpusStorage.exe
