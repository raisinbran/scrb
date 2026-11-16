### A-555 — 2026-11-15 — Codex / model unavailable / Mac local — summary progress updater kept unused prior state

- **Status / attribution:** Confirmed implementation lint error; no runtime defect.
- **What failed:** The first targeted ESLint run found an unused `current` parameter in the summary progress state updater.
- **Impact:** Targeted lint exited with one error; no test or application behavior failed.
- **Correction / remaining risk:** Replaced the updater callback with a direct event-state mapping, then rerun lint. Low.
