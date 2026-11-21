### A-963 — 2026-11-20 — W10 — Issue-comments connector argument name was wrong

- **Status / attribution:** Confirmed agent invocation error; the connector rejected both requests before reading comments.
- **What failed:** The issue-comments tool requires `repo_full_name`, but the first two calls passed `repository_full_name`.
- **Impact:** Two unnecessary failed reads; no GitHub state changed.
- **Correction / remaining risk:** Used the documented `repo_full_name` parameter and retrieved the assigned M1 checkpoint. Low.
