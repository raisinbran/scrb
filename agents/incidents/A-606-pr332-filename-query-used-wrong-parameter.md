### A-606 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — PR #332 changed-file lookup

- A first GitHub connector call used `repository_full_name` where that tool requires `repo_full_name`; the connector rejected the request and returned no filenames.
- Retried with the documented argument and obtained PR #332's changed-file list. No repository state changed; no remaining risk.
