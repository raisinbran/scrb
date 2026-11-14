### A-366 — 2026-11-14 — Codex / Mac desktop — patch context was not checked before editing

- **Status / attribution:** Confirmed agent editing error; no application effect.
- **What failed:** Two patch attempts used an incorrect test heading and then a malformed multi-file hunk. A later register correction was also first sent to the incident file instead of the usage-row file. The rejected edits did not partially apply.
- **Impact / evidence:** Three failed patch tool calls and avoidable delay; the worktree remained unchanged by the rejected attempts.
- **Correction / remaining risk:** Read the exact surrounding source and applied smaller verified hunks to the intended files. None.
