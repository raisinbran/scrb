### A-662 — 2026-11-16 — Codex / BCHEN-W10 — Git restore blocked by sandbox index permission

- **Observed effect:** `git restore` could not restore two agent-edited documentation files because the sandbox denied creating `.git/worktrees/package-win-slice2-20261116/index.lock`.
- **Evidence:** Git returned “Unable to create ... index.lock: Permission denied”; the two files remain modified and uncommitted.
- **Attribution:** Environment permission boundary; no repository index was changed.
- **Correction:** Use the approved elevated Git restore limited to the two files, then reapply the intended focused documentation edits.
- **Remaining risk:** None once the restored files and narrow diffs are verified.
