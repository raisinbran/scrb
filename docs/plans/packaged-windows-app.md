# Packaged personal-use Windows 11 app ("Scribe")

**Status:** plan only, 2026-11-13. Nothing was built or run. **Independent ChatGPT review: pending.** Owner approval needed before any slice (it touches launch paths and helper paths). Facts come from reading the repo on a Mac; **anything marked (unverified) was not checked on a Windows PC.** No recordings were read.

**Goal:** `Scribe` installed on a Windows 11 PC for the owner alone, started from the Start menu, with recording, live text and final pass working as on the Mac build (plan #155, PR #161). Requirements: Windows 11 only; builds "unsigned or self-signed for personal use", SmartScreen warning accepted once (V1 Requirements §Distribution). Not in scope: Windows live-speed fixes (Gate 3 Windows is open, see §9), Windows 10, Arm, auto-update, model-download screen, contract changes.

## 1. Shared with the Mac build vs Windows-only

| Piece | Shared | Windows-only work |
| --- | --- | --- |
| App id / name | `com.raisinbran.scribe`, `Scribe`, `asar: false`, `files` list, `resources\bin` layout | `electron-builder.yml` today has a **top-level** `extraResources` from `build/mac-stage/bin`, so a Windows target alone would package Mac files (or fail). Move it into `mac.extraResources` and add `win.extraResources` from `build/win-stage/bin` to `bin` (x64, `target`); a Mac build must still produce an identical bundle (test 1b) |
| Resolver | `resolvePackagedSetup`, model table, `scripts/model-digests.json`, config files written to `<userData>/config/`, "never fall back to the mock", env vars ignored when packaged | tool file names get `.exe`; `modelsDirFor` is Mac-only (`~/Library/Application Support/Scribe/models`), needs a Windows branch |
| `userData` pin | `pinUserData` already uses `app.getPath('appData')`, so on Windows it resolves to `%APPDATA%\@scrb\desktop` (unverified) | check on a PC with an old dev build (§5) |
| Models | same five files, same digests | installer script in PowerShell/Node (the Mac one is bash with `shasum`, `tar -xj`) |
| Security rules | unchanged | none |
| Tools | same seven names | all seven must be obtained or built for Windows and their DLLs staged (§4): six in slice 2, `scrb-capture.exe` in slice 3 |
| Capture | helper protocol, `ProcessAdapter` | `native/windows-capture` (C++, WASAPI) instead of Swift |
| Signing | n/a | none or self-signed (§3) |
| Bundle check | `stage-mac-tools.mjs` (fails on any library outside bundle/system) | `stage-win-tools.mjs` stages `build\win-stage\bin`; and a post-package check on `win-unpacked\resources\bin` for every `.exe` staged so far plus every DLL: the six non-capture tools in slice 2, all seven once `scrb-capture.exe` joins in slice 3, run on the packaged output, not only the stage folder |
| Tests | `apps/desktop/e2e/packaged.spec.ts` (mac executable path in its comment only) | run it against `Scribe.exe`; Windows CI already runs `npm run check`-equivalent steps |

## 2. What exists for Windows today

- **Capture helper:** `native/windows-capture` builds `scrb-capture.exe` with `build.cmd` (MSVC in `C:\BuildTools`, Windows SDK 10.0.26100, libopus statically linked, fetched by `scripts/fetch-opus.ps1`). It uses WASAPI mic capture and **process-tree loopback** for the meeting app, or whole-computer loopback. It speaks the same JSON protocol as the Mac helper, has a live PCM named-pipe option, and `checkPermission` always returns `granted`. Tests: `PipelineTests.exe`, `LivePcmTests.exe`, `ChunkVerify.exe` plus Node case scripts (`pause_case`, `crash_case`, `restart_case`, `stop_paused_case`, `long_run`, …) and recorded results under `results/`. README says device cases and the 4 h run passed on one PC; **real meeting apps are not all done** (Teams process target was fixed, Zoom and browser targets unrun; BUG-1 in `docs/bug-tracker.md`).
- **Catch for packaging:** the helper links the dynamic C runtime (`/MD`). The README says a shipped build must bundle the runtime or move helper and opus to `/MT`. Recommend `/MT` (no redistributable to ship); that needs a rebuild and a rerun of `PipelineTests` (unverified).
- **whisper.cpp:** the repo pins `upstream/whisper.cpp` at `284029c0…` (1.9.5-dev). For Windows, `MANIFEST.md` lists only **CUDA** prebuilts (whisper.cpp **b5454**, an older build; needs an NVIDIA GPU and CUDA DLLs). No CPU-only Windows whisper build, and no check that `whisper-server` and `whisper-vad-speech-segments` exist in that zip or match the pinned source, is recorded (unverified). Whisper.cpp and the models are MIT.
- **sherpa-onnx:** the official v2.0.1 `win-x64-shared-MD-Release-no-tts` release is in the manifest (DLLs: C API and ONNX Runtime). `scrb-sherpa` itself is built only by `build-sherpa-sidecar.sh` with `clang++`; **no Windows build of `scrb-sherpa.exe` is documented** (unverified).
- **ffmpeg / ffprobe:** CI builds them on Windows (MSYS2 UCRT64, `build-ffmpeg.sh` writes `.exe`) and caches `packages/transcription/.bin/`. Whether they are static or need MinGW runtime DLLs, and the configure flags relevant to licensing, were not read (unverified; `packages/transcription/THIRD_PARTY_NOTICES.md` and `scripts/audit-notices.mjs` are the places to check).
- **Windows CI:** `.github/workflows/ci.yml` runs `windows-latest` and `macos-latest` in a matrix: typecheck, lint, tests (`SCRB_REQUIRE_DECODER=1`), boundary check, build, `test:smoke`. It does **not** build the capture helper, run capture tests, package, or run a packaged app. I found no list of known flaky Windows tests in the docs searched (unverified; check recent CI history before trusting a red Windows run). One Windows-only unit test exists (`recording.test.ts`, fresh pipe on helper restart).
- **Start-up limit:** `lateStartNsFor('win32')` keeps the original **100 ms** limit; Mac got 2 s (`docs/handoffs/start-up-gap-and-single-instance-20261113.md`). The 100 ms came from Windows timing on the PCs measured, not from a packaged build.
- **Single instance:** `main.ts:163` `requestSingleInstanceLock()` with `second-instance` restoring the window; platform-independent. **Auto-start:** none exists.
- **Owner PCs:** BCHEN-W10 (older; screen/speaker shutoff of about 2 minutes; used for Gate 3 work) and Regiurn (newer; Strata installed; memory notes say empty workspace, no repo, and "Windows 10 Home"). **Windows 11 is required, and neither PC's version is verified: run `winver` first.** Which PC has the MSVC toolchain (`C:\BuildTools`) is also unverified.

## 3. Installer and signing

**Recommendation:** electron-builder **NSIS, per-user, not one-click-with-admin**: `win.target: nsis` x64, `nsis.perMachine: false`, `oneClick: true`, `allowElevation: false`, `deleteAppDataOnUninstall: false`. It installs to `%LOCALAPPDATA%\Programs\Scribe`, creates a Start-menu shortcut and an uninstaller, needs **no admin**, and replacing = run the new installer over the old one. Libraries, settings, models and `userData` are never touched by install or uninstall. Fallback if NSIS misbehaves: `win.target: dir` (an unpacked folder, run `Scribe.exe`), which is also **slice 1** because it is the smallest thing that proves the build.

Build on Windows (electron-builder on Windows is the supported path; no cross-build from the Mac).

| Option | Cost | Result | Catch |
| --- | --- | --- | --- |
| **Unsigned** (recommended) | free | built on the same PC: no download mark, no SmartScreen. Copied/downloaded to another PC: SmartScreen "unknown publisher", More info → Run anyway, once | **Smart App Control** (Windows 11) in enforcement mode may block unsigned, unknown executables outright with no override (unverified); check it in test 0. It cannot be switched back on once off, so the owner decides whether to turn it off on a given PC |
| Self-signed certificate | free | removes nothing for SmartScreen unless the certificate is added to the PC's Trusted Publishers and Root stores; Smart App Control still distrusts it (unverified) | more setup than value for one owner |
| Paid code-signing / Microsoft's signing service | recurring fee (unverified) | clean install on any PC | not worth it for personal use; same stance as the Mac plan |

Also unverified: Defender or SmartScreen may flag or slow the first launch of unsigned helper executables inside the bundle.

## 4. Tools, models, permissions

**Tools (in `resources\bin\`, same seven names with `.exe`):** `scrb-capture`, `whisper-cli`, `whisper-server`, `whisper-vad-speech-segments`, `scrb-sherpa`, `ffmpeg`, `ffprobe`, plus every DLL they load (`sherpa-onnx-c-api.dll`, `onnxruntime*.dll`, ggml/whisper DLLs if shared, MinGW runtime if ffmpeg needs it). The package script stages into `build\win-stage\bin`, which `win.extraResources` copies to `resources\bin`. A Windows counterpart of `stage-mac-tools.mjs` (Node, `dumpbin /dependents` or equivalent walked recursively; fail on any DLL outside the bundle or `System32`) copies and checks them. Recommend a **CPU whisper build of the pinned commit** (MSVC + CMake, already installed per the manifest) so the same `whisper-vad-speech-segments` flags apply and no NVIDIA/CUDA is required; optional CUDA later, not in this plan. License notices for ffmpeg, whisper, sherpa, ONNX Runtime and opus must ship with the bundle (`audit-notices.mjs`); the Windows ffmpeg build's actual license terms are **not verified**.

**Models:** copied once, outside the app, to `%LOCALAPPDATA%\Scribe\models\` (not Roaming: ~810 MB must not sync with a roaming profile), same five files, same SHA-256 table `scripts/model-digests.json`, same start-up verification, same "models missing, run …" message with a Windows command. Same decision as the Mac (no bundling, no download UI). The **How a clean PC gets the models:** the build PC runs `package-win.ps1 -StageModels <folder>`, which hash-verifies the five models (archive, then extracted segmentation file, then `scripts\model-digests.json`) from the dev assets and writes one self-contained **handover folder**: `models\` (the five files), `model-digests.json`, and `install-models.ps1`. The owner copies that folder to the clean PC (USB or network share) and runs `powershell -File install-models.ps1` from inside it; the script re-checks every file against its own copy of the digests (refusing a mismatch), then copies into `%LOCALAPPDATA%\Scribe\models`. On the build PC the same script runs against the dev assets directly. No repository, no dev assets and no download are needed on the clean PC. The segmentation model arrives as a `tar.bz2` archive: the installer must verify the archive hash, extract it, then check the extracted file against the pinned digest, as the Mac script does (Windows `tar` can read bz2: unverified).

**Microphone:** the helper opens the mic with WASAPI as a child of `Scribe.exe`. A desktop (non-Store) app is governed by Settings → Privacy & security → Microphone → "Let desktop apps access your microphone" (unverified for the packaged app). The helper already has a result for that switch being off (`results/mic-privacy-off.txt`); the plan checks that the app shows a clear message rather than a silent recording (test 3). No prompt is expected, so there are no Info.plist-style strings to add.

**System audio:** Windows has no system-audio permission; process loopback and whole-computer loopback need no consent (`checkPermission` always `granted`). Known limit: Communications-type streams are silent in per-app mode (BUG-1); whole-computer works. Packaging neither fixes nor worsens this.

## 5. `userData`, legacy folder, single instance, auto-start

- **Pin:** the first statement of the packaged app already calls `pinUserData`, which maps to `<appData>\@scrb\desktop`, i.e. `%APPDATA%\@scrb\desktop` on Windows, the folder the dev build uses (unverified). The library-location pointer and settings are therefore found with **no migration**; the `Scribe` product name never decides where data lives. Windows must not lose settings: test 5 starts the packaged app on a PC that has a saved non-default library and checks it opens the same library. If the dev build's real folder differs from `%APPDATA%\@scrb\desktop`, fix `USER_DATA_FOLDER` for that platform before anything else ships. Default library `~/Documents/Meeting Scribe` becomes `%USERPROFILE%\Documents\Meeting Scribe`; OneDrive "known folder backup" may move Documents (unverified, check the real path in Settings).
- **Single instance:** keep the existing lock. Because `userData` is pinned, an installed Scribe and a dev copy contend for the same lock and index; quit one first (same rule as the Mac). Test: launch twice, second launch focuses the first.
- **Auto-start:** none, none added (no login item). The NSIS shortcut is the only entry point. Recording-start surprises on login are not wanted.

## 6. Slices (smallest first; each is its own PR; none waits for a gate)

1. **First slice: unpacked Windows app shell.** `win:` block with `target: dir`, x64, **and the per-platform resource split** (top-level `extraResources` moved to `mac.extraResources`; `win.extraResources` from `build/win-stage/bin`, which `package-win.ps1` creates empty in this slice; a Mac rebuild must be unchanged, test 1b); `modelsDirFor` and tool file names per platform with unit tests (run on Mac and Windows CI); `scripts/package-win.ps1` that builds the unpacked app only; message text with the Windows install command. No tools or helper are staged yet (the bundle's `bin` is empty, so the app reports them missing). Run `packaged.spec.ts` against `Scribe.exe` on a PC: name is Scribe, saved library kept, "cannot record yet, missing …" shown, no mock fallback. Backend (non-UI) change only; no contract change.
2. **Tools inventory and staging:** obtain/build the **six** non-capture tools (`whisper-cli`, `whisper-server`, `whisper-vad-speech-segments`, `scrb-sherpa`, `ffmpeg`, `ffprobe`), `stage-win-tools.mjs` with the recursive DLL walk, notices, and a check on the packaged `win-unpacked\resources\bin` that those six `.exe` and every dependency DLL are present; verify each runs from the staged folder with dev assets hidden.
3. **Capture helper in the bundle:** `/MT` rebuild decision, `scrb-capture.exe` staged (the packaged-bin check now requires **all seven** `.exe` plus DLLs), `PipelineTests` rerun, `-StageModels` handover folder and `install-models.ps1`, bundle self-containment test on a clean PC.
4. **NSIS per-user installer:** `target: nsis`, install, replace-in-place, uninstall keeps data; Smart App Control / SmartScreen behavior recorded.
5. **Packaged end-to-end:** mic switch, recording with invented speech and test tone, final pass, export, restart.

## 7. Verification matrix (invented or AMI data only; every item under 20 minutes)

All commands run in **PowerShell, not as administrator**, from the `scrb` folder on that PC (its path is not known here). Script and flag names below are planned, not existing.

| # | Slice | PC | Admin | Command / step | Pass |
| --- | --- | --- | --- | --- | --- |
| 0 | 1 | both | no | `winver`; Settings → Privacy & security → Windows Security → App & browser control → Smart App Control (read only) | Windows 11 confirmed; Smart App Control state noted |
| 1 | 1 | one with the repo and Node | no | `npm install; npm run check`; `scripts\package-win.cmd` (launcher for the `.ps1`; runs it with the execution-policy bypass) | unpacked `apps\desktop\release\win-unpacked\Scribe.exe` exists |
| 1b | 1 | Mac (build PC) | n/a | `scripts/package-mac.sh`, then list `Scribe.app/Contents/Resources/bin` | still the seven Mac tools; no Windows files |
| 2 | 1 | the Windows PC from step 1 | no | `$env:SCRB_PACKAGED_APP="…\Scribe.exe"; npx playwright test apps/desktop/e2e/packaged.spec.ts` | passes (name, library pointer, refusal to record) |
| 3 | 1/5 | one with a saved dev library | no | start the unpacked app; open Settings; compare `dir $env:APPDATA\@scrb\desktop` before and after | same library, same settings, nothing moved |
| 4 | 3 | **Regiurn** (clean: no repo, no dev assets, if Windows 11) | no | copy the packaged app folder and the handover folder (`models\`, `model-digests.json`, `install-models.ps1`, made on the build PC by `-StageModels`); run all seven tools in `resources\bin` with `--help`/`-version`; `powershell -File install-models.ps1` from the handover folder | all run; hashes verified; a one-byte corrupted model is refused |
| 5 | 4 | one PC, then the other | no | run the NSIS installer; open from Start; run installer again; uninstall | no admin prompt; data survives replace and uninstall |
| 6 | 5 | one PC, owner present | no | Settings → Privacy → Microphone → desktop apps off, then on; record 3 min with a test tone (`docs\dev-test-tone.md`) plus invented speech | clear message when off; both tracks when on |
| 7 | 5 | same | no | 3-minute record, stop, wait for final pass; check transcript, speakers, playback, DOCX/PDF export; import a 5-minute AMI ES2004a clip | all work; note the start-of-recording gap warning (100 ms limit, §8) |

Do not use **BCHEN-W10** for any run where the ~2-minute screen/speaker shutoff would invalidate the result; prefer Regiurn for 6–7 if it is Windows 11. No long test is planned. CI stays green on both platforms.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Neither PC is Windows 11 | `winver` first (test 0); requirement is 11 only |
| Smart App Control blocks unsigned executables | test 0 records its state; owner decides; no signing purchase |
| No CPU Windows whisper / `scrb-sherpa.exe` build documented | slice 2 builds them from pinned sources before anything else depends on them |
| A tool needs a DLL outside the bundle (CRT, MinGW, ONNX Runtime) | recursive dependency walk and a clean-PC test (4) |
| `/MD` helper needs the VC redistributable | rebuild helper and opus with `/MT`, rerun `PipelineTests` |
| 100 ms start-up limit fires a false "gap" warning in a packaged build (Defender first-run scan, slower start) | observe in test 7; change only with a measured value, as for the Mac's 2 s |
| `userData` folder differs from `%APPDATA%\@scrb\desktop` | test 3 before slice 4; fix the constant for Windows |
| Packaged app and dev app run together | single-instance lock shares `userData`; quit one first |
| Defender flags or slows unsigned helpers | note on first run; add an exclusion only if the owner chooses |
| Windows live transcription cannot keep up with two busy tracks (Gate 3 Windows open: median delay 12.59 s, overflow) | out of scope here; the packaged build inherits it; see the performance-settings plan |
| Capture of Teams per-app is silent (BUG-1), Zoom/browser unrun | use whole-computer capture; known, unchanged |
| OneDrive moves `Documents` | confirm the actual library path in test 3 |

## 9. Owner decisions needed

1. Approve this plan after independent review.
2. Installer: per-user NSIS (recommended) vs unpacked folder only.
3. Signing: unsigned (recommended), turn Smart App Control off on the PC only if it blocks the app.
4. Models location: `%LOCALAPPDATA%\Scribe\models` (recommended) vs `%APPDATA%\Scribe\models`.
5. Whisper on Windows: CPU build of the pinned commit (recommended) vs CUDA prebuilt (needs NVIDIA).
6. Which PC is the build PC and which is the clean-PC test (and confirm each is Windows 11).
