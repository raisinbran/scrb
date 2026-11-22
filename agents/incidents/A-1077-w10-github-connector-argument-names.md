### A-1077 — 2026-11-22 — Codex Desktop / Windows — GitHub metadata calls used wrong repository argument key

- **Status / attribution:** Confirmed read-only tool invocation error.
- **What failed:** Two calls in one inspection batch passed `repo_full_name` where the connector schema required `repository_full_name` or `repo_full_name` as documented for the specific method. Both returned argument-validation errors; no data was read from those calls.
- **Impact:** Small inspection delay only. Subsequent supported read-only API calls verified current PR #432 metadata and exact-head check results. No repository, account, desktop, test, or production-data state changed.
- **Agent-controlled cause:** Reused a repository parameter name across two different GitHub connector methods without checking their method-specific schemas.
- **Correction / remaining risk:** Used the documented parameter names and read-only GitHub fetch endpoints; no retries of CUA/GUI tools or manual workflow dispatch. Low.
