### A-902 — 2026-11-20 — W10 — formatter diff compared the same temporary file

- **What failed:** The formatter output was captured, but the follow-up `git diff --no-index` used the formatted temporary path for both operands instead of comparing it with the managed-worktree source.
- **Impact:** The command showed no useful diff and no project files changed; the preserved checkout was restored.
- **Correction / remaining risk:** Compare the formatted temporary file against the managed-worktree test path to retrieve the exact formatter adjustment. Low.
