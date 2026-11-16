### A-558 — 2026-11-15 — Codex / Mac desktop — full CI exposed stale required-model counts

- **Status / attribution:** Confirmed test coverage omission. No product defect.
- **What failed:** Focused slice tests passed, but exact-head macOS CI found two existing mock-backend assertions that counted every model as a required speech model. The new optional summary fixture makes the setup list six items and is installed by default in that fixture.
- **Impact:** The first exact-head CI attempt failed during the full test step on macOS; 2,058 tests passed, 4 skipped, and the two stale assertions failed. Windows CI was still running when corrected.
- **Correction / remaining risk:** Updated assertions to check the five required roles separately and assert the optional summary's installed/size state. The affected mock-backend suite passed 59/59, with Prettier and `git diff --check` passing. A corrected exact-head CI run remains required. Low.
