### A-894 — 2026-11-20 — W10 — usage example path absent from clean main worktree

- **What failed:** Tried to read a usage row from the preserved installer worktree using a relative path in the clean main worktree, where that untracked row does not exist.
- **Impact:** No usage data was read or changed; one bounded documentation lookup failed.
- **Correction / remaining risk:** Use the documented 12-column header and current task readings to create this task's new usage row. Low.
