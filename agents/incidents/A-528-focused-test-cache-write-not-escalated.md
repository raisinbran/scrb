### A-528 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — focused test cache writes were not escalated

- **Status / attribution:** Confirmed agent process error; Vitest did not collect or run tests.
- **What failed:** After learning that the managed worktree denies ordinary shell writes, I ran the focused Vitest command without escalation. Vite could not create its temporary config-cache directories in the worktree and stopped during project setup.
- **Impact:** One test setup attempt failed before collection. No application assertion ran and no source, report, recording, stash, or primary checkout state changed. The independent register check passed.
- **Correction / remaining risk:** Run focused test commands with the required sandbox escalation so Vitest can create temporary files only within the isolated worktree. Low.
