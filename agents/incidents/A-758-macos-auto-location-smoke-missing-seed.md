### A-758 — 2026-11-17 — Codex Desktop / BCHEN-W10 — macOS CI did not seed the isolated startup location

- **What failed:** Exact-head CI run 1469 passed its macOS unit suite and build, but the new Electron smoke test read `location.country === null` on first launch. The equivalent focused Windows smoke passed.
- **Agent-controlled cause:** The startup gate checked canonical paths, then passed the original path spellings to a helper that checked them again. macOS temporary paths can have distinct symlinked spellings; this is the provisional cause.
- **Impact:** The macOS smoke step failed; no production profile or library was involved.
- **Correction / remaining risk:** The helper now receives the canonical profile, library, and temp paths already verified under the temp root. Exact-head CI must confirm this resolves the macOS result. Low if confirmed.
