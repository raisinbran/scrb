### A-565 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — syncing the isolated worktree

- **Status / attribution:** Confirmed agent command-reference error; no application or Git branch state changed.
- **What failed:** After fetching the PR branch from the main checkout, I ran `git reset --hard FETCH_HEAD` in the linked worktree. That worktree did not have its own `FETCH_HEAD` reference.
- **Impact:** The reset exited before changing any files; the local branch remained on its previous commit.
- **Correction / remaining risk:** Use the fetched remote-tracking ref `origin/cuc/live-recordings-levels-20261115` explicitly, then verify the worktree head and status. Low.
