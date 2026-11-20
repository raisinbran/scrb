### A-900 — 2026-11-20 — W10 — formatted source copy denied by worktree permissions

- **What failed:** After formatting a temporary copy in the preserved checkout, attempted to copy the formatted test file back into the separate managed worktree. Windows denied that cross-worktree write.
- **Impact:** The managed worktree remains unchanged by the copy attempt; the preserved checkout was restored in `finally`.
- **Correction / remaining risk:** Apply the formatting adjustment directly to the managed worktree using its authorized patch mechanism, then validate through CI. Low.
