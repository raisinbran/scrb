### A-903 — 2026-11-19 — Unsupported search-prs argument in path-error incident reconciliation

- **Classification:** Confirmed cloud connector argument error; unrelated to Scribe runtime or the owner's path correction.
- **Event:** The first GitHub open-PR listing was invoked with unsupported parameter names `q` and `per_page`, rather than the action's documented `query` and `topn`. Tool validation rejected the request before issuing a search.
- **Impact:** One avoidable failed read-only orchestration call; no repository mutation, device action, CI retry, install, recording, or data exposure.
- **Correction:** Reissued once with exact supported parameters; subsequently checked incident A-902/A-903 filenames against current main, cloud coordination branch and all 28 open PR changed-file lists. No conflicts found in those published locations; unpublished local reservations remain unknown.
- **Publication:** Provisional on unreviewed cloud coordination branch, not main. Incident separated from the more consequential owner-detected A-902 path defect.
