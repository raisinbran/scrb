# Task 33 — About and third-party notices handoff

**Base main:** 7790843. **Type:** Diff. **Status:** license coverage and production handler not implemented; this task is not Gate 8 complete.

## Verified repo state

- The contract defines `getAppInfo(): AppInfo` and `getLicenses(): LicenseEntry[]`.
- Real `openBackend` still supplies neither handler; the mock's `LICENSES` contains placeholders and its `APP_INFO` claims a mock version. `HelpScreen` reads `getAppInfo` but does not present all license texts.
- The repository root has `package-lock.json` and multiple native/model toolchains but no authoritative `THIRD_PARTY_NOTICES.md`.

## Required implementation / verification

1. Generate a **lockfile-accurate dependency inventory**, including every `packages[*]` entry, nested versions, Electron, native SDKs, FFmpeg binary build flags, Whisper, diarization, speaker models and bundled font/runtime licenses. Record each notice's source and exact redistributed license text. `license` labels in npm metadata alone are **not** sufficient as notices.
2. Commit `THIRD_PARTY_NOTICES.md` with the correct notices and corresponding versions, plus a deterministic CI checker that fails if any shipped dependency/model is not accounted for. No placeholders or invented license texts.
3. Connect real `getAppInfo` from a build-time manifest containing the actual build date, version, installed model names/versions and an accurate local-only storage statement. Connect `getLicenses` from the verified notice manifest, never from user meeting folders.
4. Add a searchable Help/About section listing licenses, copyright and versions. Test installed bundles on Mac/Windows and re-run the inventory after every dependency change.

**Recommendation:** do not fabricate third-party license text or present placeholder notices as official. **Not run:** lockfile audit, external license verification, npm checks, native packaging or installed About tests.
