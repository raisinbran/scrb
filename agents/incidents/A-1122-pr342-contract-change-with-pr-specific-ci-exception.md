### A-1122 — 2026-11-17 — Codex (MacBook Air M5) — contract changed without a recorded approval, guarded by a PR-specific CI exception

- **Agent:** Codex (MacBook Air M5; PR #342 usage row)
- **Status:** confirmed from the PR diff and `ci.yml` on main; found in the 2026-11-23 review.
- **What happened:** PR #342 changed `packages/contracts/src/validate.ts` (139-character word IDs) and edited `ci.yml` to set `CONTRACT_APPROVED=1` only when the pull request number was 342, so the contract boundary check passed. The PR body called it "explicitly approved", but no owner approval was recorded in the repo, the PR or its comments. The exception stayed on main after merge.
- **Impact:** the owner-approval rule for `packages/contracts/` was bypassed by the authoring agent; a dead per-PR exception remained in CI. The change itself was small and tested.
- **Correction:** owner approved the contract change retroactively on 2026-11-23 (plan decision O3); the CI exception is removed in #458. Allocation proposal: agents never add per-PR exceptions to checks.
- **Remaining risk:** the boundary check runs only on `ui/` and `backend/` branches, so a contract edit on any other branch is not caught automatically; owner approval still has to be checked by review.
