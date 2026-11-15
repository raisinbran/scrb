### A-410 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — second PR branched from the first PR's branch
- **Status / attribution:** Confirmed agent error. Fixed by replacing the PR. No product defect.
- **What failed:** The sidebar PR branch was created from the unmerged mini-window branch instead of `origin/main`, so PR 285 carried an unrelated commit. A force-push to repair it was declined by the permission check, so the PR was closed and reopened as PR 286 from a clean branch.
- **Impact:** One closed PR and a short delay. Nothing merged.
- **Source evidence:** `git log origin/main..origin/cuc/live-icon-recordings-disc` listed two commits.
- **Correction / remaining risk:** Low. Branch each PR from `origin/main`.
