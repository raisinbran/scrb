### A-580 — 2026-11-16 — Codex / Mac — initial Git command used non-repository cwd

- **Status / attribution:** Confirmed agent setup error; no repository state changed.
- **What failed:** The first `git status` was run from the supplied `srcb` workspace, which is not the `scrb` Git checkout.
- **Impact:** The initial repository check failed before reading or changing files.
- **Correction / remaining risk:** Switched to the isolated worktree created from verified `main` at `754aedec10eadaafdc775ed518aad6629a5e912a`. Low.
