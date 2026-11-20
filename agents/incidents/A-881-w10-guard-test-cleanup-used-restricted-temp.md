### A-881 — 2026-11-20 — W10 — guard-test cleanup used a restricted OS temp path

- **Status / attribution:** Confirmed test-harness setup and cleanup error; no application defect.
- **What failed:** The new behavioral guard script placed synthetic fixtures under `[IO.Path]::GetTempPath()` and recursively removed the generated fixture directory. In this restricted Windows session, cleanup reported access denied at `C:\Users\bchen\AppData`. Two generated `scribe-guard-tests-*` fixture directories remained under the OS temp tree after the direct run and Vitest run.
- **Impact:** The initial direct and Vitest runs failed during cleanup. Inspection showed the two expected fixture directories and their synthetic files still present; no owner data was read or changed, and no installer or app was launched. The attempted cleanup was limited to the generated fixture path, but its failure left disposable test debris on this host.
- **Correction / remaining risk:** Moved new fixtures under the writable repository script directory, added containment validation, and reran the behavioral guard suite successfully. The two earlier OS-temp directories remain because the restricted account denied cleanup; they are isolated synthetic fixtures and must be left for the host's normal temp cleanup. Low.
- **Publication:** Included in the W10 smoke-test correction PR; local and unpublished until that PR update is reviewed and merged.

