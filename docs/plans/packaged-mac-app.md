# Packaged personal-use macOS app (double-clickable)

**Status:** plan only, 2026-11-13. Owner approval needed first (it touches launch security and where helpers run). **Independent review: pending.** Nothing was built or run; facts below come from reading the code and the owner's dev-assets folder. No recordings were read.

**Goal:** `Meeting Scribe.app` in `/Applications`, started by double-click, recording, live text and final pass working like `scripts/m1.sh` does today. Personal use, Apple Silicon Mac, no installer for anyone else. Windows is out of scope here.

## 1. What the repo does today

- **No packaging at all.** `apps/desktop` builds with Vite (renderer) and esbuild (`scripts/build-electron.mjs` → `dist-electron/{main,preload}.cjs`, `liveWorkerEntry.mjs`, `exportWorkerEntry.mjs`). No electron-builder or forge config exists. `npm start` runs `electron .` from the repo. (`docs/plans/task-30-installer-resources.md` sketched this; nothing was built.)
- **Gates on `app.isPackaged`:**
  - `main.ts:24` ignores `SCRB_DEV_SERVER_URL` when packaged (stays: the app must never load another page).
  - `backend.ts:62,64,76` ignore `SCRB_CAPTURE_HELPER`, `SCRB_FINAL_PASS_CONFIG`, `SCRB_LIVE_CONFIG` when packaged, so a packaged build today is mock-only.
- **What real mode needs** (from `~/scrb-dev-assets/config/*.json`, built by `scripts/dev-assets.sh`):

  | Piece | Today | Size |
  | --- | --- | --- |
  | capture helper `scrb-capture` | `native/macos-capture/build/` (Swift + libopus, `build.sh`) | small |
  | `whisper-cli`, `whisper-server`, `whisper-vad-speech-segments` | `~/scrb-dev-assets/upstream/whisper.cpp/build/bin`, **dynamically linked** to `@rpath` `libwhisper`, `libggml*` dylibs | ~1 MB each + dylibs |
  | `scrb-sherpa`, `ffmpeg`, `ffprobe` | `packages/transcription/.bin/` (gitignored; absent in this worktree). `scrb-sherpa` is dynamically linked to `libsherpa-onnx-c-api` from `upstream/sherpa-onnx/build/install` (a development-directory path) and that library pulls in **ONNX Runtime** dylibs | few MB + libs |
  | models: `ggml-large-v3-turbo-q5_0` (final), `ggml-small.en-q5_1` (live), silero VAD, sherpa segmentation + embedding | `~/scrb-dev-assets/models/` | ~574 + 190 + 1 + 2 + 40 ≈ **810 MB** |

- **Library and settings:** library root is read from a pointer file in `app.getPath('userData')` (today `~/Library/Application Support/@scrb/desktop`), default `~/Documents/Meeting Scribe`. Settings live in the library's `index.sqlite` (node's built-in SQLite, no native npm module to rebuild). So recordings and settings are outside the app and survive replacing it.
- **Permissions:** Electron's web-permission handlers deny everything (`security.ts`), correct and unchanged. Capture is native: the helper opens the mic and a Core Audio **process tap** (`CATapDescription`, not ScreenCaptureKit), so macOS asks for *Microphone* and *System Audio Recording*. It is spawned as a child process (`process-adapter.ts`).

## 2. Recommended smallest option

**Build an unpacked `.app` with electron-builder (`--mac dir`), ship tools in the app, keep models outside it, sign ad-hoc (later a free self-signed certificate if re-prompting annoys).** No DMG, no notarization, no auto-update, no model-download UI.

Why: it adds one build config and one resolver. Models stay out of git and out of the app (810 MB would make every rebuild slow). The owner's Mac builds and runs it, so no quarantine flag is set and Gatekeeper does not interfere.

### Steps

1. **Build config.** Add electron-builder at an exact pinned version (check `npm view` at implementation time; `npm install -E`). `apps/desktop/electron-builder.yml`: `appId` e.g. `local.meetingscribe`, `productName: Meeting Scribe`, `files`: `dist/**` (renderer), `dist-electron/**`, `package.json`; `mac.target: dir`, `arch: arm64`, `hardenedRuntime: false` (not notarizing, so no entitlements and no library-validation trouble), `mac.identity: null` here and signing done in step 4. `extendInfo`: `NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription` (see §4). Check that `electron-builder` does not pull the whole monorepo into the app; the main and worker bundles are already self-contained esbuild outputs.
2. **Bundle the tools and their full library chain.** `extraResources` copies into `Contents/Resources/bin/`: `scrb-capture`, `whisper-cli`, `whisper-server`, `whisper-vad-speech-segments`, `scrb-sherpa`, `ffmpeg`, `ffprobe`, and into `Resources/bin/lib/` **every** dynamic library they load: `libwhisper`, `libggml*`, `libsherpa-onnx-c-api`, the ONNX Runtime dylib(s) and anything else `otool -L` lists outside `/usr/lib` and `/System`. `scripts/package-mac.sh` walks `otool -L` recursively for each executable to build that list (fails on any library it cannot place), rewrites install names and rpaths with `install_name_tool` (`-add_rpath @loader_path/lib`, `-change` for absolute development paths, `-delete_rpath` for any `~/scrb-dev-assets` rpath), and then asserts no remaining reference to a path outside the bundle, system or `/usr/lib`. Binaries stay gitignored. Notices for ffmpeg/whisper/sherpa/onnxruntime/opus are covered by `scripts/audit-notices.mjs`; include them in the bundle.
3. **Models outside the app, one canonical directory: `<userData>/models/` = `~/Library/Application Support/@scrb/desktop/models/`.** Everything below (installer script, resolver, missing-model message, tests) uses this one path and nothing else. Fixed file names as in the table. `package-mac.sh --install-models` copies the files from `~/scrb-dev-assets/models` and verifies each against its **full 64-character SHA-256**. The complete hashes are the ones in `scripts/dev-assets.sh` (its `fetch <dest> <sha256> <url>` calls; `third_party/MANIFEST.md` only has abbreviated hashes and is not used). The staging script reads them from that file, so there is one source. A file whose hash differs is refused (not copied, not used), and the app re-checks size and hash of the five model files at start and treats a mismatch as missing. If a model is missing, the app starts but shows a clear "models missing, run …" message and refuses to record rather than silently using the mock. A first-run download (Task 31) is deferred.
   **`userData` and the library-location pointer.** The packaged app calls `app.setPath('userData', <home>/Library/Application Support/@scrb/desktop)` as its first statement (before the single-instance lock and before anything reads `userData`), so the folder is the same one the dev build uses and the saved library-location pointer is found unchanged: **no migration, nothing moved**. electron-builder's `productName` therefore never decides where data lives. This is covered by test 5b below.
4. **Signing.** After build, `codesign --force --deep --sign "<identity>"` over the whole app including `Resources/bin/*` and dylibs (inside-out: dylibs and helpers first). Identity `-` (ad-hoc) first. See §3.
5. **Env gates replaced by a resolver** (§5), in one reviewed change with a test.
6. **Replace the app:** quit, copy `dist/mac-arm64/Meeting Scribe.app` over `/Applications/Meeting Scribe.app`. Library untouched.

## 3. Signing options for personal use

| Option | Cost | Result | Catch |
| --- | --- | --- | --- |
| **Ad-hoc (`-`)** | free | runs on this Mac; Apple Silicon requires some signature, and this gives it | macOS ties permissions to the exact build, so **each rebuild may re-ask** for Microphone and System Audio (and Documents). Fine for occasional rebuilds. |
| **Stable self-signed certificate** (Keychain Access → Certificate Assistant → Code Signing) | free | same signing identity every build, so permissions are normally kept across rebuilds | one-time setup by the owner (I give exact clicks); the cert must be trusted for code signing or `codesign`/electron-builder may report no valid identity. Still not notarized. |
| **Apple Developer ID + notarization** | **US$99 per year** (Apple Developer Program) | opens on any Mac without warnings | needs enrollment, hardened runtime, entitlements (`audio-input`, JIT etc.) and notarization on every build. Only worth it if the app goes to another person's Mac. Prior owner decision (Task 30): avoid the annual cost unless a measured blocker remains. |

Moving the app to a *different* Mac (e.g. by download) sets the quarantine flag; the owner would right-click → Open once, or run `xattr -cr`. Not needed on the build Mac.

**Recommendation:** ad-hoc first; switch to the free self-signed certificate if re-prompting after rebuilds is annoying. Do not buy Developer ID.

## 4. Permission prompts

- Strings in the app's `Info.plist`:
  - `NSMicrophoneUsageDescription`: "Meeting Scribe records your microphone so it can transcribe your meetings on this Mac. Nothing leaves your computer."
  - `NSAudioCaptureUsageDescription` (system audio taps, macOS 14.2+): "Meeting Scribe records the sound of your meeting app (the other participants) so it can transcribe it on this Mac. Nothing leaves your computer."
  - No screen-recording string: capture uses process taps, not ScreenCaptureKit.
- **Main risk:** macOS attributes a child process's mic/tap request to the "responsible" app. A helper spawned from the signed app should inherit the app's identity and strings, but this has to be confirmed on the real packaged app (§7, test 3). Fallback if it fails: embed an `Info.plist` in the helper (`-sectcreate __TEXT __info_plist`) or wrap it as a tiny nested `.app`, which needs a small change in `process-adapter.ts` path resolution only.
- The dev build's permissions are granted to "Electron" and do not carry over; the packaged app asks again once. The existing `requestPermission`/status check in the helper (`Permission.swift`) is unchanged.
- First write to `~/Documents/Meeting Scribe` may also show a Documents-folder prompt. Expected.

## 5. How the `app.isPackaged` gates change

Keep **exactly** as is: `devServerUrl` gate, context isolation, sandbox, no node integration, the two IPC channels and allowlists, denied web permissions. No contract change.

Change `backend.ts:62,64,76` from "packaged → off" to:

- **Unpackaged:** unchanged, env vars `SCRB_CAPTURE_HELPER`, `SCRB_FINAL_PASS_CONFIG`, `SCRB_LIVE_CONFIG` opt in (so `m1.sh` and every e2e test keep working).
- **Packaged:** env vars **still ignored** (an environment must not be able to point the app at another executable). Paths come from one pure function `resolvePackagedSetup(resourcesPath, userDataPath)` that returns the helper path and writes `final-pass.json` and `live.json` into `userData/config/` with absolute paths to `Resources/bin/*` and `userData/models/*`. The existing loaders then read those files unchanged. If any required file is missing it returns a list of what is missing, which the app shows; it never falls back to the mock silently.
- Unit tests: resolver output for a full and for a missing-model layout; the packaged path still ignores the env vars (guards the safety property).
- The mixed real/mock hybrid backend (`hybrid-backend.ts`) is unchanged; samples still appear. Removing mock sample meetings from a packaged build is a separate, small follow-up.

## 6. Auto-update

Not needed. Update = rebuild and copy over `/Applications`. Library and settings are outside the bundle. No update server, no `electron-updater`.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Child helper's permission prompt not attributed to the app | Test 3 first; fallback in §4 |
| A tool or library still points at a development path (whisper, ggml, sherpa, ONNX Runtime) → tool fails to start on a clean machine | recursive `otool -L` walk, install-name/rpath rewrite and a no-outside-reference assertion in the staging script; test 2 runs with dev assets hidden |
| Ad-hoc re-sign invalidates permissions every rebuild | switch to self-signed certificate |
| Library-location pointer lost if `userData` changed | `userData` is pinned to the existing `@scrb/desktop` path (§2 step 3); test 5b |
| Packaged app and dev app run together | single-instance lock shares userData if the path matches; `m1.sh` already refuses a running copy; quit one first |
| electron-builder drags in monorepo `node_modules` and bloats/breaks the app | check app size and `app.asar` contents; main/worker are esbuild bundles so only `electron` and `files` are needed |
| Performance of a packaged build differs | none expected; same binaries and models |
| Unsigned-tools warning from Gatekeeper for bundled binaries | all inside the one signed bundle; built locally, no quarantine |

## 8. Test plan (invented or AMI data only; every test under 20 minutes)

1. **Resolver unit tests** (§5): full layout, each missing piece, env vars ignored when packaged. Seconds. Also: a corrupted (one byte changed) model file is rejected by the installer script and by the start-up check; the models directory used by the script and by the resolver is the same constant.
2. **Bundle check, no dev assets:** asserts the 7 executables, the full library chain and notice files exist, `otool -L` shows no path outside the bundle/system, `codesign --verify --deep --strict` passes, and then **runs every tool (`--help`/version) from the built `.app` with `~/scrb-dev-assets` temporarily renamed away** (e.g. `HOME`-independent: run as a copy of the app in a temp folder; the models directory is set up from the script). ~3 min.
3. **Permission test (~10 min, owner at the Mac):** launch the `.app`, start a recording with the dev test tone (`docs/dev-test-tone.md`, `SCRB_TEST_TONE_FILE` with an AMI clip) playing through system audio and the owner speaking invented lines. Confirm both prompts show the usage strings, then grant, and the recording has both tracks.
4. **End-to-end ≤ 10 min:** record 3 minutes (tone plus invented speech), stop, wait for final pass, check transcript, speakers, playback and DOCX/PDF export. Then import a 5-minute AMI ES2004a clip.
5. **Restart and replace:** quit, reopen (library and settings persisted), rebuild and replace the app, reopen, confirm the library is still there and note whether permissions are re-asked.
   5b. **Pointer and models together:** set a non-default library location in the dev build, quit, launch the packaged app: it opens that same library, finds the models in `<userData>/models`, and the settings are unchanged. Repeat with the pointer file absent (default `~/Documents/Meeting Scribe`).
6. **Missing models:** move the models folder away; app must show the message and refuse to record, not use the mock.
7. `npm run check` and `npm run test:smoke` stay green (unpackaged path unchanged).

No long test is planned; none needs the 20-minute approval. Do not use the owner's real recordings.

## 9. Owner decisions needed

1. **Approve the plan** (touches launch and helper paths), after independent review.
2. **Signing:** ad-hoc now, free self-signed certificate if re-prompts annoy (recommended), or pay US$99/yr for Developer ID (not recommended for one Mac).
3. **Models:** copy from the dev-assets folder into `~/Library/Application Support/@scrb/desktop/models/` (recommended), or bundle inside the app (about 1 GB per build), or build the download screen (later).
4. **Installing:** plain `.app` copied to `/Applications` (recommended) vs a DMG (only useful when sharing).
5. **App id and name:** `Meeting Scribe`, `local.meetingscribe` OK?
6. **Windows** packaging: separate plan later.

## 10. Out of scope

Notarization, DMG, auto-update, first-run model download, Windows, removing the mock sample meetings, any contract change.

