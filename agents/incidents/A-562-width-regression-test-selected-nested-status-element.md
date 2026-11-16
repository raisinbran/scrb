### A-562 — 2026-11-15 — Codex / model and effort unavailable / Mac desktop — banner width regression assertion

- **Status / attribution:** Confirmed test-authoring error; no application defect.
- **What failed:** The first width consistency assertion treated the nested paragraph's `role="status"` as the banner root, so it did not contain the progress bar.
- **Impact:** One targeted UI test failed; the remaining 139 targeted tests passed.
- **Correction / remaining risk:** The assertion now selects the banner by its processing-specific class and checks that it contains the progress bar. The targeted Live and Recordings suites then passed 140/140; low.
