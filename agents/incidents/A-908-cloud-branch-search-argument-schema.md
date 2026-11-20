### A-908 — 2026-11-20 — Cloud incident-audit branch search used an invalid parameter name

- **Classification:** Confirmed cloud connector-argument mistake while auditing Mac/W10 incident reservations; no repo or host state change.
- **What failed:** The first `search_branches` call supplied `repo` and `top_k` instead of the supported `repo_name` and `page_size`. Schema validation rejected the call before a branch search ran.
- **Impact:** One wasted diagnostic call; no missed collision claim was based on it. A later corrected query returned the relevant cloud coordination branches.
- **Correction / prevention:** Read connector action schemas before use and pass `owner`, `repo_name`, `query`, `page_size` exactly. The incident audit was rerun with valid arguments, then independently checked against all 30 open PR changed-file lists and current `main`.
- **Publication:** Cloud coordination branch only, unreviewed, not `main`. Identifier provisionally reserved from current public branch registry; other machine-local reservations remain unknown.
