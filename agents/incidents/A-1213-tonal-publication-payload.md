### A-1213 — 2026-11-26 — Oversized draft publication payload

- **Agent:** Codex (Desktop, Mac)
- **Observed effect:** Preparing a GitHub tree from complete file contents exceeded the command output limit. Parsing the truncated response failed before the connector received a write.
- **Attribution:** The publication step assumed the command transport would return the full payload in one response.
- **Correction:** Published the existing checked commit with a direct branch push and verified that draft PR #518 points to that exact commit.
- **Remaining risk:** This incident row is local and unpublished because the draft is already at the review handoff.
