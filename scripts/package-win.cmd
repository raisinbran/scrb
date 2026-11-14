@echo off
rem Runs package-win.ps1 without the PowerShell execution-policy block (this process only).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-win.ps1" %*
exit /b %ERRORLEVEL%
