@echo off
call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul
cd /d %~dp0
set OUT=%1
if "%OUT%"=="" set OUT=LiveDiarize.exe
set SHERPA=%~dp0..\..\tools\sherpa-onnx\sherpa-onnx-v2.0.1-win-x64-shared-MD-Release-no-tts
cl /nologo /EHsc /O2 /std:c++17 /W3 /D_CRT_SECURE_NO_WARNINGS /I"%SHERPA%\include" LiveDiarize.cpp /link /LIBPATH:"%SHERPA%\lib" sherpa-onnx-c-api.lib /out:%OUT%
copy /y "%SHERPA%\lib\*.dll" . >nul
