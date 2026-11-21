### A-891 — 2026-11-20 — W10 — dependency reuse junction denied

- **What failed:** Attempted to add a directory junction in the clean managed worktree to reuse the already installed `node_modules` from the preserved checkout. Windows denied creation of the junction in the managed worktree.
- **Impact:** No test or project file was changed by this attempt; the targeted test could not use the existing dependencies through that path.
- **Correction / remaining risk:** Keep the clean worktree and existing checkout separate. Run the same targeted test from the existing dependency-equipped checkout while temporarily substituting only the new test file, then restore its original contents. The change remains unverified until that run completes; low.
