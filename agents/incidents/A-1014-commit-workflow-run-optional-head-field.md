### A-1014 — 2026-11-21 — Cloud — Incorrect optional workflow field blocked first PR #361 gate check

- **Attribution:** Confirmed self-induced read-only gate-check error, corrected before any merge.
- **Failure:** The initial PR #361 premerge gate treated `fetch_commit_workflow_runs` results as if `workflow_runs[].head_sha` were supplied, and required it to equal the checked SHA. That source did not return this optional field, so the script reported `passed=false` despite the successfully completed exact-commit workflow `44876932978`.
- **Impact:** One avoidable additional read/gate execution. It did not bypass a required check, merge a red PR, trigger CI retries or change any source. GitHub retained the exact-commit run evidence.
- **Correction:** Kept the exact SHA in the commit-specific request and verified a completed-success result, independently checked the expected PR head, current-head formal review and fresh GitHub mergeability, then squash-merged #361 with an expected-head lease. Subsequent merges used the corrected gate.
- **Prevention:** Treat tool result schemas as strict; do not invent optional fields. Always inspect a result's exposed shape before writing a safety gate.
- **Publication:** On draft PR #396, alongside this task's usage row; final exact-head checks and independent review remain pending.
