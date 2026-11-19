### A-803 — 2026-11-18 — Codex Desktop / MacBook Air M5 — package script invoked non-executable capture build script directly

- **Status / attribution:** Confirmed packaging-script invocation error; no application defect.
- **What failed:** The first build-only `scripts/package-mac.sh` attempt called `./build.sh`, but the tracked capture build script is not executable in this checkout.
- **Impact:** Packaging stopped before rebuilding the helper or producing an app. No `/Applications` files or prior candidate output were changed.
- **Correction / remaining risk:** Invoke the script as `bash ./build.sh`. Low; the package build may proceed after that correction.

- **Publication ID reconciliation:** Published here as A-803; the original local candidate record A-793 remains unchanged. The original identifier overlapped the open incident set for PR #368.
