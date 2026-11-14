@echo off
rem Runs m1.test.ps1 without the PowerShell execution-policy block (this process only).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0m1.test.ps1" %*
exit /b %ERRORLEVEL%
