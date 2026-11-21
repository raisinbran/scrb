### A-728 — 2026-11-17 — Codex / BCHEN-W10 — unsupported contributor endpoint

- **What failed:** A GitHub connector fetch for the repository contributors endpoint was rejected because that endpoint is not in the connector's allowed resource list.
- **Impact:** No reviewer identity data was returned and no GitHub state changed.
- **Agent-controlled cause:** I used an endpoint that the connector documentation does not support.
- **Correction / remaining risk:** Stopped using that endpoint and limited follow-up to documented PR and review tools. Low.
