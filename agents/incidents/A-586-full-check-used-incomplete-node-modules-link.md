### A-586 — 2026-11-16 — Codex / Mac — full check used incomplete dependency link

- **Status / attribution:** Confirmed test setup error; no application defect.
- **What failed:** The first full check used the existing checkout's `node_modules` through a temporary symlink; it lacked locked dependencies including `pdfjs-dist` and `@vitejs/plugin-react`.
- **Impact:** Type-check stopped early, before lint or tests.
- **Correction / remaining risk:** Removed the symlink and installed locked dependencies with `npm ci` in the isolated worktree. Low.
