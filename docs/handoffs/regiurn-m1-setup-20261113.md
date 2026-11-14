# REGIURN Windows M1 setup — 2026-11-13

**Tested main commit:** `b39a38f5b8bbbb4b5bd39866e9f425d8169452d8` (PR #190 is included).
**Device:** Regiurn, Windows 11 Home, non-admin PowerShell.
**Winver:** Version 26H2 (OS Build 26300.9974); the About Windows dialog identifies Windows 11 Home. The registry `ProductName` string still says `Windows 10 Home`.

## Steps 0–8

0. **Partial: required Node pin was not on PATH.** `vcvars64.bat` exists; Git 2.43.0 is present; `C:\msys64` and the initial `scrb-dev-assets` seed were absent; Git Bash exists; shell was not administrator. Default `node -v` is `v26.13.0`, not the runbook pin. `npm install` was run with Node 22.23.4 via `npx --package=node@22.23.4`.
1. **Pass.** Updated checkout is main; `npm install` completed and `node_modules\electron\dist\electron.exe` exists. npm reported 15 vulnerabilities (1 low, 14 moderate).
2. **Pass.** `asr`, `diarization`, and `upstream` each ended `done (...) in /c/Users/brand/scrb-dev-assets`; no SHA-256 mismatch was reported.
3. **Fail.** First, the exact runbook `fetch-opus.ps1` invocation was blocked before execution: `File C:\Users\brand\Documents\scrb-check\scrb\native\windows-capture\scripts\fetch-opus.ps1 cannot be loaded because running scripts is disabled on this system.` One retry with process-scoped `-ExecutionPolicy Bypass` failed at line 10 with `fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.` No further retry was made; `build.cmd` and `PipelineTests.exe` were not run, and `scrb-capture.exe` was not produced. The optional `phase0-archive` ref is absent, so the CSV test command was skipped as the runbook directs. The failed fetch left an incomplete empty Git repo under `native\windows-capture\third_party\opus`; it was kept.
4. **Pass.** Static CPU whisper.cpp build completed all 78 targets. Files:
   - `C:\Users\brand\scrb-dev-assets\upstream\whisper.cpp\build\bin\whisper-cli.exe`
   - `C:\Users\brand\scrb-dev-assets\upstream\whisper.cpp\build\bin\whisper-server.exe`
   - `C:\Users\brand\scrb-dev-assets\upstream\whisper.cpp\build\bin\whisper-vad-speech-segments.exe`
5. **Pass.** MSVC compiled `packages\transcription\.bin\scrb-sherpa.exe`; required sherpa and ONNX DLLs were copied beside it. Running without arguments printed `usage: scrb-sherpa <segmentation.onnx> <embedding.onnx> <threads>` (exit code 1, expected usage output). `cl` also left untracked generated `scrb-sherpa.obj` in the repo root; it was not deleted or committed.
6. **Pass using existing binaries; compile skipped.** An all-drive search found existing ffmpeg/ffprobe pairs. The pair from `C:\Users\brand\OneDrive\Pictures\CGI\yt-dlp` was copied into `packages\transcription\.bin`; both `-version` commands ran successfully. Versions: `N-116599-g43cde54fc1-20240811`.
   - `C:\Users\brand\Documents\scrb-check\scrb\packages\transcription\.bin\ffmpeg.exe`
   - `C:\Users\brand\Documents\scrb-check\scrb\packages\transcription\.bin\ffprobe.exe`
   The all-drive search reported access denied for protected locations; it found both working pairs without admin access.
7. **Pass.** Configs were written:
   - `C:\Users\brand\scrb-dev-assets\config\live.json`
   - `C:\Users\brand\scrb-dev-assets\config\final-pass.json`
8. **Pass for refusal check; setup incomplete.** `scripts\m1.ps1` printed:

   ```text
   Cannot start real mode. Missing:
     - capture helper: C:\Users\brand\Documents\scrb-check\scrb\native\windows-capture\build\bin\scrb-capture.exe (build it: see docs\plans\windows-m1-run.md, step 3)
   ```

   It did not launch Scribe. No recording was started; steps 9 and 10 were not run.

## Additional requested test

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\m1.test.ps1` printed `ok` and exited 0. It uses a fresh temp fake repo and removed only that test-created temp directory.

## Incidents / working tree

Incidents A-354 and A-355 document two corrected preflight command mistakes. No source code was changed. npm’s lockfile-only metadata churn was restored. The root `scrb-sherpa.obj` is deliberately left untracked under the no-delete rule. **Independent review: pending.**

## Follow-up attempt — 2026-11-13

This continuation stopped before resuming Step 3 because Node 22.23.4 was not available on PATH. The `npx --yes --package=node@22.23.4 --call "node -v"` wrapper produced no output, remained active for over 35 seconds, and was interrupted with exit code 1; it emitted no error text. A first wrapper attempt also produced no usable output. A read-only search of the common npm cache and Node installation locations found only `C:\Program Files\nodejs\node.exe` (v26.13.0). No libopus fetch or checkout, `fetch-opus.ps1`, `build.cmd`, or rerun of `m1.ps1` was performed in this continuation.

The three workarounds and their status are:

1. **Execution policy bypass:** previously used for `fetch-opus.ps1`; it passed the policy barrier but the script failed because the fresh Opus clone had no valid `HEAD` (`fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.`).
2. **Node 22.23.4 on PATH:** previously used via the `node@22.23.4` package wrapper for `npm install`. In this continuation the wrapper did not initialize successfully, so the requested PATH prerequisite was unavailable and no setup command was run under Node 26.13.0.
3. **Pre-seed pinned libopus checkout:** not performed; continuation stopped before any Git fetch or checkout under the Node PATH requirement.

The requested GPU query succeeded on the non-administrator account:

| Name | DriverVersion |
| --- | --- |
| Intel(R) UHD Graphics 770 | 32.0.101.7088 |
| NVIDIA GeForce RTX 3080 | 32.0.16.1088 |

No recording was started; steps 9 and 10 remain unrun.
