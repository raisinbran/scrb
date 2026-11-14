@echo off
rem Runs fetch-opus.ps1 without the PowerShell execution-policy block (this process only).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fetch-opus.ps1" %*
exit /b %ERRORLEVEL%
