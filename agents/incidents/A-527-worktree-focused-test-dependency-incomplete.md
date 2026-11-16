### A-527 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — focused test setup used incomplete shared dependencies

- **Status / attribution:** Confirmed agent setup error; no test assertion ran and no application defect was shown.
- **What failed:** I symlinked the older primary checkout's `node_modules` into the current-main worktree. It lacked `@vitejs/plugin-react`, so the focused Vitest command failed while loading the workspace config, before test collection.
- **Impact:** One focused-test setup attempt failed. Vitest created an empty `.vite-temp` directory under the shared dependency tree; its temporary config file was already cleaned up. No source, report, recording, stash, or test evidence was changed.
- **Correction / remaining risk:** Remove the shared link, restore the empty temporary directory side effect, and install the current lockfile dependencies only in the isolated worktree before rerunning the focused test. Low.
