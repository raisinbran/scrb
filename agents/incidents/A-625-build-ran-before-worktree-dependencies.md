### A-625 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — building the isolated desktop app

- **Status / attribution:** Confirmed worktree setup omission; no application defect.
- **What failed:** The first desktop build ran before dependencies had been installed in the fresh worktree and exited because `vite` was unavailable.
- **Impact:** That build attempt produced no app artifacts.
- **Correction / remaining risk:** Ran `npm ci` in the isolated worktree and reran the desktop build successfully. Low.
