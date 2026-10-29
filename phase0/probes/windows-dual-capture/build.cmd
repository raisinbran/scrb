@echo off
call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul
cd /d %~dp0
cl /nologo /EHsc /O2 /std:c++17 /W3 DualCapture.cpp /link /out:DualCapture.exe
