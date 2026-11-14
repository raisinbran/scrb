### A-363 — 2026-11-14 — Codex / Mac desktop — nested lock command used the wrong path and empty cache
- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** From `packages/export`, I used a repository-root-relative incident path, so the incident write failed. Because the shell command did not stop after that error, the following offline npm attempt also ran and failed because the required package metadata was not cached.
- **Impact:** No repository package files were changed by this command; another short command cycle was needed.
- **Correction / remaining risk:** Wrote this incident from the worktree root and retried the package-local lock update with registry access. Low.
