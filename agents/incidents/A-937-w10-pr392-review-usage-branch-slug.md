### A-937 — 2026-11-20 — Codex Desktop — PR #392 usage verification used a mistyped branch slug

- **Status / attribution:** Confirmed agent invocation error; no repository state changed.
- **What failed:** Two read-only GitHub verification calls used `codes/w10-pr392-review-20261120` instead of the created branch `codes/w10-pr392-review-usage-20261120`, and both returned 404.
- **Impact:** One unnecessary verification retry and short delay; no remote write or repository mutation was attempted by those calls.
- **Correction / remaining risk:** Used the exact created branch slug for the follow-up verification. Low.
- **Publication:** Added with the usage row to the reporting-only PR branch; unpublished pending normal PR review.
