### A-801 — 2026-11-18 — Codex Desktop / MacBook Air M5 — ARM64 verification passed multiple paths to single-input lipo

- **Status / attribution:** Confirmed verification-command error; no application defect.
- **What failed:** I invoked `lipo -archs` once with four file paths. This macOS command accepts exactly one input file, so it exited with usage error after the preceding `file` and SHA-256 checks completed.
- **Impact:** The combined architecture check did not run; no files or processes were changed.
- **Correction / remaining risk:** Re-run the architecture check with one path per invocation. Low.

- **Publication ID reconciliation:** Published here as A-801; the original local candidate record A-791 remains unchanged. The original identifier overlapped the open incident set for PR #368.
