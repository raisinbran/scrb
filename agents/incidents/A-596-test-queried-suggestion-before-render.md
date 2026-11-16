### A-596 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — focused Speakers layout test

- **Status / attribution:** Confirmed test synchronization error; no application defect.
- **What failed:** The first focused UI test run queried the new suggestion heading synchronously immediately after emitting the mock event, before React rendered it.
- **Impact:** One new test failed; 43 other tests passed in that targeted run.
- **Correction / remaining risk:** Wait for the suggestion heading before checking its parent column, then rerun the focused UI tests. Low.
