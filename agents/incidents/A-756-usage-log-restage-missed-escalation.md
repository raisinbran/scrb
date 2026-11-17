### A-756 — 2026-11-17 — Codex Desktop / BCHEN-W10 — usage-log restage omitted escalation

- **What failed:** A plain `git add` for the updated task usage row was denied while writing `.git/index.lock`.
- **Agent-controlled cause:** I retried a Git index write in the sandbox instead of using the already-approved elevated repository operation.
- **Impact:** The usage row remained modified but unstaged; no other files were staged or changed by the command.
- **Correction / remaining risk:** Restage only the intended usage and incident records through the approved elevated operation. Low.
