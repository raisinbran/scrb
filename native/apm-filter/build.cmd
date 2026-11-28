@echo off
rem Builds build\scrb-apm-filter.exe from the pinned WebRTC APM (see subprojects\). Needs Python with meson.
if not defined SCRB_VCVARS64 set "SCRB_VCVARS64=C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%SCRB_VCVARS64%" (
  echo Visual C++ x64 environment is missing: %SCRB_VCVARS64%
  exit /b 1
)
call "%SCRB_VCVARS64%" >nul
cd /d %~dp0
if not exist build (python -m mesonbuild.mesonmain setup build --wrap-mode=forcefallback || exit /b 1)
python -m mesonbuild.mesonmain compile -C build || exit /b 1
