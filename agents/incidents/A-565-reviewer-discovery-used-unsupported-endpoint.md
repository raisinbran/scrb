### A-565 — 2026-11-15 — Codex / Mac desktop — reviewer discovery used unsupported GitHub endpoint

- **Status / attribution:** Confirmed inspection error; no repository state changed.
- **What failed:** I queried the GitHub connector's public fetch endpoint for the repository contributors list. That endpoint is not in the connector's allowed URL set and returned HTTP 400 before any data was retrieved.
- **Impact:** The reviewer lookup did not identify a collaborator; the PR remains open with independent review pending.
- **Correction / remaining risk:** Stop probing unsupported contributor endpoints. Use only supported repository files and PR metadata; if no reviewer is identified, leave review pending for the owner to route. Low.
