### A-1129 — 2026-11-23 — Claude Code — probe used the shared stash and overshot a reset

- **Agent:** Claude (Claude Code, Opus 5.5, Mac desktop app)
- **Status:** confirmed; corrected in the same session with no data lost.
- **What happened:** while probing the new contract check in a scratch worktree, (1) `git stash -- <new file>` stashed nothing, so `git stash pop` tried to apply the owner's unrelated older stash `primary-checkout-recovery-records-2026-11-15` (worktrees share one stash list); the pop failed and kept the stash, but copied its three untracked files into the scratch worktree; (2) a `git reset --soft HEAD~1` after a `--hard` reset went one commit too far. Also, the first probe tested uncommitted edits, which the check (commit range only) cannot see.
- **Impact:** none to the owner's data: the stash is intact and byte-identical copies were removed from the scratch worktree only; the work was restored from the reflog. A few extra commands.
- **Correction / remaining risk:** never use `git stash` in a worktree of a repo with existing stashes; probe with throwaway commits and reset to an explicit SHA.
