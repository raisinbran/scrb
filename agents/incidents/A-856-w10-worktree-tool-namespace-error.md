### A-856 — 2026-11-19 — W10 — first worktree tool alias was unavailable

- **Status / attribution:** Confirmed tooling-call error; no repository state changed.
- **What failed:** The first managed-worktree call used the desktop-tool alias unavailable through the dynamic tool surface.
- **Impact:** The call returned an availability message and created no worktree.
- **Correction / remaining risk:** Reissued the same request through the available Codex app MCP tool; it created one dedicated worktree at the pinned A2 commit. Low.
