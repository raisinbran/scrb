### A-561 — 2026-11-15 — Codex / model and effort unavailable / Mac desktop — UI regression test dependency setup

- **Status / attribution:** Confirmed agent setup errors; no application defect.
- **What failed:** The first check command invoked npm without the repo Node directory on `PATH`. I then linked the stale main checkout's `node_modules` into this fresh worktree; Vitest could not resolve the required `@vitejs/plugin-react` package.
- **Impact:** The first targeted test attempt stopped before collecting any cases.
- **Correction / remaining risk:** Added the repository Node path and installed the worktree's lockfile dependencies offline with scripts disabled. The targeted tests then ran; low.
