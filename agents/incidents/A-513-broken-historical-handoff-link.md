### A-513 — 2026-11-15 — ChatGPT Chat (GPT-6) / cloud — historical handoff link pointed to wrong branch
- **Status / attribution:** Confirmed documentation error; corrected on the existing handoff PR. No product code or private evidence was affected.
- **What failed:** The recovery audit and planner handoff used a relative Markdown link to `planner-handoff-20261115.md`. That file exists only on PR #301's historical head, not on the branch containing PR #318, causing GitHub to return 404.
- **Impact:** Owner could not open the historical handoff from either newly authored document.
- **Source evidence:** `docs/handoffs/planner-session-handoff-20261115.md` and `docs/handoffs/three-machine-recovery-audit-20261115.md` on PR #318; exact historical handoff file verified at `ee024c8b572cf2010dc2900265b878ddd95043c2`.
- **Correction / remaining risk:** Replaced both relative links with an immutable GitHub URL anchored at the verified commit. Future links to files outside the current branch must use their actual ref and be checked before publication. No known remaining broken link for this target.
