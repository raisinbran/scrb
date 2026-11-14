### A-390 — 2026-11-14 — Claude Code (planner session) — committed a node_modules link into PR #242 and left PR #237 without its usage row
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I created a temporary worktree, linked the main checkout's `node_modules` into it, then ran `git add -A`, which committed the link into PR #242 (absolute local path). Separately I opened PR #237 without the required usage-log file. Earlier in the day I also listed already-merged PRs as open, which the owner had to correct twice.
- **Impact:** Independent review rejected #242 and #237 for these. Extra review round; no user-facing effect.
- **Correction / remaining risk:** Removed the link from #242 (commit 43ee247) and added the usage row to #237. Use explicit paths with `git add`, and run `gh pr view` on every PR before listing it. Low.
