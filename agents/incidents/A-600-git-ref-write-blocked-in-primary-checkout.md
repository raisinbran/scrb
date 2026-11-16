### A-600 — 2026-11-15 — Codex / Mac desktop — branch creation targeted the read-only primary Git metadata

- **Status / attribution:** Confirmed agent setup error; no source change or repository state loss.
- **What failed:** I attempted to create the task branch with `git worktree add` from the primary checkout. The sandbox denied writing `.git/refs/heads/...lock`, because that checkout's Git metadata is read-only here. An earlier chained availability probe also stopped on `rg`'s expected no-match exit before its final path check.
- **Impact:** The first worktree command failed and delayed the implementation setup; no ref, index, or tracked file was changed in the primary checkout.
- **Correction / remaining risk:** Created a local shared clone under `/private/tmp`, verified its worktree base is current `origin/main` commit `754aedec10eadaafdc775ed518aad6629a5e912a`, and added the independent worktree there. No escalation or direct primary-checkout write was attempted again. Low.
