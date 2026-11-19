### A-835 — 2026-11-18 — W1 test search named nonexistent directories

- **Status / attribution:** Confirmed agent search error; no source changed.
- **What failed:** I searched `scripts/test`, `apps/desktop/test`, and `native/windows-capture/test` before checking the repository's tracked file layout; those directories do not exist.
- **Impact:** The search returned path errors and no test inventory.
- **Correction / remaining risk:** Located `scripts/stage-win-tools.test.mjs` with `rg --files`. Low.
