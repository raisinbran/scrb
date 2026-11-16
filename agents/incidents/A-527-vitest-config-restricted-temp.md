### A-527 — 2026-11-16 — Codex / BCHEN-W10 — temporary Vitest config placed in restricted Temp

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** The focused Vitest run was first given a temporary config under `%TEMP%`. Node could not resolve that config because Windows denied traversal of the `AppData` path (`EPERM` at `C:\Users\bchen\AppData`). The test did not start. Cleanup of that temporary path was also denied.
- **Impact:** One unnecessary failed test startup. A temporary config file may remain under `%TEMP%`; it contains only `export default { test: { environment: 'node' } }` and no project or user data.
- **Correction / remaining risk:** Re-ran the seven tests with the same minimal config inside the authorized worktree; all seven passed, then removed the in-worktree config and log. No product failure or evidence change.
