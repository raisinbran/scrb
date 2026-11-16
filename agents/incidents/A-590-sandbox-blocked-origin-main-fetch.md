### A-590 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — fetching current main

- **Status / attribution:** Confirmed command-execution restriction; no repository reference changed.
- **What failed:** The initial sandboxed `git fetch origin main` could not write `.git/FETCH_HEAD` (`Operation not permitted`).
- **Impact:** The first fetch produced no usable update.
- **Correction / remaining risk:** Retried the same fetch with scoped elevated execution, verified `origin/main` at `754aedec10eadaafdc775ed518aad6629a5e912a`, then created the isolated worktree from that ref. Low.
