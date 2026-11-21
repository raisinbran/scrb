### A-854 — 2026-11-19 — W10 — prior-worktree Git inspection hit ownership guard

- **Status / attribution:** Confirmed inspection-command error; no repository state changed.
- **What failed:** A read-only `git status` and `git rev-parse` query targeted the prior W1 worktree without a path-scoped `safe.directory` override. Git refused the inspection because that checkout is owned by a different Windows identity.
- **Impact:** Those two metadata values were not retrieved. The commands did not write files, change Git configuration, or repair permissions.
- **Correction / remaining risk:** Continued from the new pinned worktree and the prior staged manifests. If another read-only Git inspection is essential, use a command-scoped override for the exact trusted upstream repository; do not change global Git settings or ACLs. Low.
