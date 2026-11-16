### A-526 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — initial Git metadata writes lacked escalation

- **Status / attribution:** Confirmed agent process error; no application defect.
- **What failed:** I first ran `git fetch origin main` and `git switch -c cuc/gate8-rate-aware-verifier` without the required sandbox escalation, and attempted to create the worktree dependency symlink without escalation. The Git metadata writes and symlink creation were denied.
- **Impact:** No ref, worktree content, dependency tree, primary checkout, recovery stash, evidence, or report was changed by the denied attempts. The current main fetch and isolated branch creation later succeeded through the approved escalation path.
- **Correction / remaining risk:** Route Git metadata writes through escalation when the sandbox marks `.git` read-only. Low.
