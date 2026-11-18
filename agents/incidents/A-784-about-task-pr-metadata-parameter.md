### A-784 — 2026-11-18 — ChatGPT Chat / cloud — PR metadata update used unsupported repository key

- **What failed:** During the PR #361 implementation task, a GitHub `update_pull_request` call supplied `repo_full_name` rather than this action's required `repository_full_name`. The connector rejected the request during schema validation.
- **Impact:** One avoidable rejected metadata action and retry. No PR metadata, code, owner library, user data or CI state was changed by the invalid call.
- **Agent-controlled cause:** Reused the parameter name from other GitHub connector actions without checking this method's actual schema.
- **Correction:** The subsequent call used `repository_full_name` and updated the PR description successfully. The earlier rejection remains visible in the session history.
- **Remaining risk:** Low; exact task consumption and effort remain unavailable because this ChatGPT Chat surface exposes no per-turn effort or five-hour/weekly meter.
