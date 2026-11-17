### A-581 — 2026-11-16 — Codex / Mac — inspection command omitted worktree

- **Status / attribution:** Confirmed agent command error; no repository state changed.
- **What failed:** One later source-inspection command omitted `workdir`, so `sed` and `rg` looked in the unrelated `srcb` directory and failed.
- **Impact:** One read-only lookup had to be repeated.
- **Correction / remaining risk:** Repeated the lookup with the isolated worktree as its working directory. Low.
