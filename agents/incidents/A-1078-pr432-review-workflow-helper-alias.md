### A-1078 — 2026-11-22 — Independent review — nonexistent workflow-run tool alias

- **What failed:** A read-only source-inspection batch referenced a GitHub workflow-run helper name that is not exposed by the connector, causing the orchestration script to stop before its reads completed.
- **Impact:** No repository or workflow state changed; no CI was dispatched and no tests were run.
- **Correction / remaining risk:** Continued with supported PR/file APIs only and relied on the exact-head CI result supplied in the assignment. Low.
