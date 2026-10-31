# Task 30 — Windows/macOS installer and helper packaging

**Type:** Plan → Diff. **Base:** main 7790843. Requires owner/primary agent review before changing launch security or packaged resource paths.

## Current code and recommendation

`apps/desktop/scripts/build-electron.mjs` bundles main/preload to CommonJS with esbuild but does **not** create installers, ship capture/model sidecars, or sign a Mac app. `openBackend` intentionally disables helper and final pass when `app.isPackaged`, so a cosmetic installer without bundled workers would produce an unrecordable app.

Use a pinned build tool (prefer electron-builder or electron-forge after native code signing tradeoff review), with explicit Windows NSIS/DMG targets, reproducible resources manifest and per-platform native helper hashes. Vendor only the actual required ffmpeg/ffprobe, whisper and speaker binaries/licenses; avoid downloading arbitrary binaries during app start.

## Slices and acceptance

1. Pin the installer tool's exact version and update lockfile using `npm install --save-dev -E`. Add per-platform `extraResources` for helper executables, configuration, model metadata and bundled legal notices. Runtime resolution must use `process.resourcesPath` inside installed builds; never construct arbitrary renderer-supplied helper paths.
2. Replace the `isPackaged` opt-outs **only after** an installed helper handshake verifies compatible protocol, architecture, executable permissions and model path availability. Missing resources give a visible warning while preserving stored audio and settings.
3. Windows installer: install/uninstall/upgrade without rewriting the selected recording library. Run signed release smoke, installed capture and clean uninstall.
4. Mac: one stable self-signed certificate per owner decision; check quarantining/Gatekeeper on clean install/upgrade. Do not incur annual Apple signing costs unless a measured blocker remains after trying reasonable alternatives.
5. Keep Electron context isolation, sandbox, no nodeIntegration, origin allowlists and both IPC channels unchanged. Add a packaging manifest test that fails when any capture helper, native runtime, model metadata or required license is absent.

## Tests and outstanding

Build, run and upgrade both installers on clean Windows 11 and Apple Silicon macOS machines, including helper restart, missing model and offline-after-setup. One 8-hour run per machine before Gate 8. **Not implemented in this commit:** installer config, lockfile and env gate removal. **Not run:** npm, bundler, signing, installers or hardware.

**Recommendation:** don't remove the packaged safety gate just to satisfy a code search; it must be replaced by a verified manifest/resource resolver in the same reviewed change.