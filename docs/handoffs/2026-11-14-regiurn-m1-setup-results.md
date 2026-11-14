# Regiurn Windows M1 setup: results and script check, 2026-11-14

Independent review: pending. No recording was started; no recording test was run. M1 is **not** accepted end to end.

## (a) Observed 2026-11-13 (earlier session, filesystem sandbox)

Facts from [regiurn-m1-setup-20261113.md](regiurn-m1-setup-20261113.md) ("Follow-up 2"), seen by a session that ran inside a filesystem sandbox:

- The pinned Opus fetch (`git fetch --depth 1 origin 251d657e...`) and `fetch-opus.ps1` each failed once (`Permission denied` on `.git/FETCH_HEAD`; CMake `Unable to (re)create the private pkgRedirects directory`) and each passed on one retry outside the sandbox, still without administrator rights.
- `build.cmd` exited 0; `native\windows-capture\build\bin\scrb-capture.exe` was present (660,480 bytes).
- Node 22.23.4 came from the official zip (SHA-256 `cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`); the system PATH was unchanged.
- `scripts\m1.ps1` failed once at the running-copy check (`Get-CimInstance` returned `Access denied`, HRESULT 0x80041003); after one retry outside the sandbox, Scribe launched to "Ready to record". No recording was started.
- GPUs: Intel UHD Graphics 770 and NVIDIA GeForce RTX 3080 (the whisper.cpp build is CPU-only today).

## (b) Verified in this task

Context for every row: standard user (not administrator, checked), ordinary PowerShell, process-local PATH with `C:\Users\brand\tools\node-v22.23.4-win-x64` first (`node.exe` and `npm.cmd` both resolved there; `node -v` printed v22.23.4). Base: origin/main `8061607`.

| Command | Result | Problem reproduced? |
| --- | --- | --- |
| `Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'"` | Succeeded, 0 processes, no error | **No.** `Access denied` was not reproduced as a standard user |
| `git fetch --depth 1 origin 251d657e...` and `git checkout` in `native\windows-capture\third_party\opus` | Both exit 0 first time | **No.** `FETCH_HEAD` permission error not reproduced |
| `fetch-opus.cmd` from a deleted `native\windows-capture\build\opus` | Exit 0 first time in about 15 s; `build\opus\opus.lib` exists (1,239,940 bytes) | **No.** The pkgRedirects failure was not reproduced; earlier failures were seen inside a filesystem sandbox. No CMake retry was added |
| `scripts\m1.test.ps1` (after the changes below) | Printed `ok`, exit 0 | n/a |
| `fetch-opus.ps1` copy in a temp folder whose `origin` does not exist | Stopped with "libopus fetch failed (git exit 128)", no CMake step started | Confirms the new Git exit-code check |

`build.cmd` and the real app launch (`scripts\m1.cmd`) were not re-run in this task.

## Changes

- `scripts\m1.ps1`: the CIM query is now wrapped in a function. If it fails, the script falls back to `Get-Process`, normalized to the same shape (ProcessId, ExecutablePath, CommandLine, HasWindow). The fallback cannot see command lines, so it refuses only when a process at this checkout's `electron.exe` path owns a window (Electron's main process does; GPU and renderer processes do not), and the message uses that PID. If a path matches but no window is seen, or a path cannot be read, it prints one line saying the check was skipped and launches. **The CIM failure was not reproduced; this fallback is defensive only.** The window heuristic was exercised only through the test hooks, not against a real running Scribe.
- `scripts\m1.test.ps1`: new hooks `SCRB_M1_FORCE_CIM_FAIL` and `SCRB_M1_FALLBACK_LIST` cover: fallback used, confirmed main app (refuses, PID 201), GPU/renderer-only (starts, skip line), unreadable path (starts, skip line), another repo's app (starts, no skip line). The existing `SCRB_M1_PROCESS_LIST` cases are unchanged and pass.
- `native\windows-capture\scripts\fetch-opus.ps1`: `git fetch` and `git checkout` exit codes are now checked and stop with a clear message.

## Not verified

Everything past the "Ready to record" screen: recording, live text, final pass. The runbook's recording tests were not run.
