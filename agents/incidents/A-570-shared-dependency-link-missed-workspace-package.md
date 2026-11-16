### A-570 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Settings unit tests

- The first Settings test run used a shared root `node_modules` symlink but omitted the desktop workspace's own `node_modules`; Vitest could not resolve `@vitejs/plugin-react` from its temporary config.
- Confirmed the package exists in the already-installed Speaker worktree's desktop dependency directory. Added a local symlink for this worktree and will retry the focused tests; no application files were changed by the failed test startup.
