### A-512 — 2026-11-15 — Codex / Mac desktop — setup command shadowed zsh's path variable

- **Status / attribution:** Confirmed agent error. No repository files or Git state changed.
- **What failed:** A setup shell command assigned a temporary path to zsh's special `path` variable, which also controls `PATH`. Subsequent `git` and `rg` commands were not found.
- **Impact:** One setup attempt failed before repository inspection could continue.
- **Correction / remaining risk:** Repeated the command using a non-special variable name. No repository state was changed by the failed command. Low.
