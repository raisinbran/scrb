### A-513 — 2026-11-15 — Codex / Mac desktop — follow-up command used a nonexistent worktree path

- **Status / attribution:** Confirmed agent error. No process started and no repository state changed.
- **What failed:** A follow-up command selected `/private/tmp/scrb` as its working directory before the actual worktree path had been established.
- **Impact:** The command could not start; no files were read or changed.
- **Correction / remaining risk:** Re-ran from the created worktree at `/private/tmp/scrb-summaries-install-slice3a-20261115`. Low.
