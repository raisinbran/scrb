### A-757 — 2026-11-17 — Codex Desktop / BCHEN-W10 — pull-request review query used the wrong repository field

- **What failed:** The first GitHub review-list query was rejected because it used `repository_full_name` where that connector requires `repo_full_name`.
- **Agent-controlled cause:** I relied on the tool description instead of its schema's required field name.
- **Impact:** One read-only query failed; no repository or PR state changed.
- **Correction / remaining risk:** Repeated the query with `repo_full_name`; it returned no submitted GitHub reviews. The separate independent review completed with no actionable findings. Low.
