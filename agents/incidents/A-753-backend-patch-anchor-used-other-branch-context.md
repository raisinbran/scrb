### A-753 — 2026-11-17 — Codex Desktop / BCHEN-W10 — backend patch anchor used another branch's context

- **What failed:** The first backend patch expected an existing synthetic-location call site that was present on the preserved issue #349 branch but absent from `origin/main`.
- **Agent-controlled cause:** I carried source assumptions across the branch switch without rereading the target file.
- **Impact:** One patch attempt failed; it made no file changes and delayed implementation briefly.
- **Correction / remaining risk:** Read the mainline backend and applied the imports and startup hook at its actual initialization point. Low.
