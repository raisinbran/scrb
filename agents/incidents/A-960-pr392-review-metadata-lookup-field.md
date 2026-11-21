### A-960 — 2026-11-20 — Codex Desktop — PR #392 review metadata lookup used wrong connector field

- **What failed:** I called the read-only GitHub PR metadata tool with `repo_full_name`; its schema requires `repository_full_name`, so it returned parameter validation errors.
- **Impact:** No repository or PR state changed; one metadata lookup was delayed until the correct field was used.
- **Correction / remaining risk:** Read the tool schema and repeated the read with the required field. Low.
