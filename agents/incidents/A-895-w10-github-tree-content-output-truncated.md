### A-895 — 2026-11-20 — W10 — GitHub tree content export exceeded response limit

- **What failed:** Tried to export all pending source and reporting files as one base64 payload for a single GitHub tree write. The command response was prefixed with a truncation warning and could not be parsed as JSON.
- **Impact:** No tree or commit was created; the remote branch remains at its base commit.
- **Correction / remaining risk:** Export each bounded file separately, combine them in memory, and create one tree on the existing branch. Low.
