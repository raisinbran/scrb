### A-567 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — committing the final layout regression

- **Status / attribution:** Confirmed command-execution setup failure; no source or Git state changed.
- **What failed:** The sandbox denied writing the linked worktree's shared Git index during `git commit`.
- **Impact:** The commit did not start; staged changes remained available in the worktree.
- **Correction / remaining risk:** Retry the same commit using scoped elevated execution, then verify the committed head and clean status. Low.
