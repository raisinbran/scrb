@echo off
rem Runs m1.ps1 without the PowerShell execution-policy block (this process only).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0m1.ps1" %*
exit /b %ERRORLEVEL%
