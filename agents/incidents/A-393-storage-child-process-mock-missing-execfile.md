### A-393 — 2026-11-14 — Codex — Storage probe import exceeded a test mock

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** The first full check after adding the Windows mapped-drive probe failed to load `recording.test.ts`: its `node:child_process` mock did not provide the newly imported `execFile` export.
- **Impact:** One full-check attempt stopped with one failed suite; the changed storage tests and other suites passed.
- **Correction / remaining risk:** Made the test mock provide a harmless `execFile` stub and retained callback-based production execution. Re-run the full check after the fix. None expected.
