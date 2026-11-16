### A-587 — 2026-11-16 — Codex / Mac — first lint pass found meter harness issues

- **Status / attribution:** Confirmed test-harness errors; no product defect.
- **What failed:** The first ESLint pass flagged unimported Node globals and an unused initial assignment in the new manual meter harness.
- **Impact:** The first full check stopped at lint.
- **Correction / remaining risk:** Imported the Node APIs explicitly and removed the unused assignment. Focused recording and Live-screen tests pass afterward. Low.
