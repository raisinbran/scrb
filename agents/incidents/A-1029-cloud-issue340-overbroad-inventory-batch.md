### A-1029 — 2026-11-21 — Cloud issue #340 incident-inventory request exceeded tooling batch limit

- Observed self-induced failure: One read-only orchestration invocation attempted to enumerate changed files across 37 open PRs at once and was rejected by the tool's maximum-call limit before results returned.
- Mechanism: Excessive concurrent connector requests in one batch, avoidable by bounded pagination.
- Effect: One rejected read-only call; no GitHub mutation, test failure, private-data access or project code change.
- Correction: Split the same incident-number inventory into four batches of 10 or fewer PRs; current-main and published PR filenames were inspected successfully.
- Prevention: Bound cloud API fan-out to 10 calls per tool invocation. Record actual retries without inferring token usage.
- Publication: Open accounting-only draft PR; checked no A-1029 in accessible current main/open PR filename inventories. Unpublished local reservations remain unverified.
