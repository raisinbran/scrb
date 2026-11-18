### A-725 — 2026-11-17 — Codex / BCHEN-W10 — Vitest startup blocked by checkout write permissions

- **What failed:** The first focused Vitest invocation could not create its API token; the next could create that token in a temporary user-data folder but could not write Vite's temporary bundled config files under the assigned worktree's `node_modules`.
- **Impact:** Two test startup attempts produced no test results and added avoidable diagnostic time. No application data or test evidence changed.
- **Agent-controlled cause:** Started the runner in the restricted external worktree before requesting the narrow write access its temporary files require.
- **Correction / remaining risk:** Requested access for the assigned worktree only, then the focused meeting-handler suite passed 60/60 and the desktop typecheck passed. Low.
