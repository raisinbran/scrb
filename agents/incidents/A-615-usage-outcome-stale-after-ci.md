### A-615 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — usage outcome remained stale after CI

- The published PR #333 usage row still said exact-head confirmation was pending after CI run 43960260670 passed on head `d468443a668739e047d5f2825d67b7966866a13d`. Independent re-review identified the stale outcome text.
- Corrected the row to record that run and the documentation-only review result; the correction creates a new documentation-only head for fresh exact-head CI.
- Remaining risk: none if the new head's CI completes successfully.
