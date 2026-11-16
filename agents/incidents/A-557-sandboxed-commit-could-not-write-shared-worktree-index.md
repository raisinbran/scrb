### A-557 — 2026-11-15 — Codex / Mac desktop — sandboxed commit could not write shared worktree index

- **Status / attribution:** Confirmed agent command/setup failure. No product defect.
- **What failed:** The first `git add && git commit` attempt ran without escalation. Commit creation failed when the command sandbox could not create the shared worktree's `.git/worktrees/.../index.lock`.
- **Impact:** The documentation-only repo instruction update was not committed by that attempt; no source or Git history was changed.
- **Correction / remaining risk:** Repeated the Git operations with the authorized sandbox escalation; the instruction update committed successfully as `e31e8c90`. Low.
