### A-583 — 2026-11-16 — Codex / Mac — Swift build used restricted default module cache

- **Status / attribution:** Confirmed test setup error; no application defect.
- **What failed:** The first native helper build wrote Swift modules to the default user cache, outside writable roots, and stopped with `Operation not permitted`.
- **Impact:** One build attempt failed before completing the helper.
- **Correction / remaining risk:** Rebuilt with `-module-cache-path` directed to the isolated temporary worktree. The helper then compiled; only existing SDK deprecation and unused-result warnings remained. Low.
