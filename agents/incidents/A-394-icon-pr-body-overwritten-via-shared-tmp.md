### A-394 — 2026-11-14 — Claude Code — PR #236 description written to a shared temp file and overwritten

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I wrote the PR #236 body to a fixed path in the shared `/private/tmp/claude-501/`, which another session overwrote with its own text, so `gh pr edit` published the wrong description (Gate 6 reconcile text).
- **Impact:** PR #236 showed a wrong description until the planner noticed; extra owner and planner time. No code effect.
- **Correction / remaining risk:** Rewrote the body from my own scratchpad file and re-applied it. All scratch files now go in the session scratchpad. None.
