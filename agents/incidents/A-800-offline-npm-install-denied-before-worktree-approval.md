### A-800 — 2026-11-18 — Codex Desktop / MacBook Air M5 — offline package setup attempted before managed-worktree write approval

- **Status / attribution:** Confirmed agent setup error; no application or repository defect.
- **What failed:** I started `npm ci --offline` and attempted to create the FFmpeg cache directory in the managed candidate worktree under the default restricted shell. Both writes were denied with `EPERM` before changing the worktree.
- **Impact:** One unnecessary denied setup attempt and a short delay. No package, source, installed app, or backup was modified by the denied commands.
- **Correction / remaining risk:** Requested the approved write escalation for the isolated worktree; offline dependency installation then completed, and the verified source archives were copied into the worktree. Low.

- **Publication ID reconciliation:** Published here as A-800; the original local candidate record A-790 remains unchanged. The original identifier overlapped the open incident set for PR #368.
