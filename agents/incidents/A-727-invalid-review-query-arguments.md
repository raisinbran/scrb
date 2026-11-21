### A-727 — 2026-11-17 — Codex / BCHEN-W10 — invalid review-query arguments

- **What failed:** Two read-only GitHub review-list calls were rejected because I supplied `repository_full_name` instead of the required `repo_full_name` argument.
- **Impact:** The review metadata was not returned by those calls; no GitHub state changed.
- **Agent-controlled cause:** I did not follow the connector's declared argument name.
- **Correction / remaining risk:** Repeated both reads with the required argument; no reviews were found on PRs #345 or #346. Low.
