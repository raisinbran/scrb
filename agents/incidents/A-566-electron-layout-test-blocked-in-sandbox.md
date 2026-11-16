### A-566 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — targeted Electron layout regression

- **Status / attribution:** Confirmed test execution setup failure; no application defect.
- **What failed:** The initial Playwright attempt launched the targeted Electron regression under the restricted sandbox, where Electron failed to launch.
- **Impact:** That attempt produced no test result and did not alter application state.
- **Correction / remaining risk:** Reran the same test with scoped elevated execution after the sandbox limitation was clear; the 1280×720 rendered-bounds assertion passed. Low.
