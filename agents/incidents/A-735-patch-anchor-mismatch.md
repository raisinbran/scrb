### A-735 — 2026-11-17 — Codex / BCHEN-W10 — patch used a test name that was not present

- **What failed:** A multi-file patch expected a library-notice test title that did not exist in the checkout. The patch was rejected without applying any of its changes.
- **Impact:** One failed edit attempt and a repeated source inspection.
- **Agent-controlled cause:** I relied on a guessed test description instead of reading the exact file before constructing the patch.
- **Correction / remaining risk:** I read the current test and reapplied smaller patches against its actual contents. The rejected patch made no filesystem changes. Low.
