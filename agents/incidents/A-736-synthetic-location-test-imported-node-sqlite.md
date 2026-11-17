### A-736 — 2026-11-17 — Codex / BCHEN-W10 — focused location test imported a Node SQLite dependency

- **What failed:** The first synthetic-location test imported the full app-core settings factory. Vitest's Vite client bundler then failed to bundle the transitive `node:sqlite` import, so the new suite ran zero tests.
- **Impact:** One avoidable red test run; no application test result was misreported.
- **Agent-controlled cause:** The test imported a broad production module when a small settings-writer stub was sufficient.
- **Correction / remaining risk:** I replaced that dependency with a focused stub and retained assertions that the normal update method receives the fictional location. The resulting focused suite passed. Low.
