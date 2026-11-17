### A-663 — 2026-11-16 — Codex / BCHEN-W10 — PR info query used the wrong repository parameter

- **Observed effect:** A read-only PR information request for #339 failed schema validation because I passed `repo_full_name` instead of the required `repository_full_name`.
- **Evidence:** Connector response listed `repository_full_name` as required. The separate exact-head workflow query succeeded and returned CI run 43997807044 in progress.
- **Attribution:** Agent tool-call error; no GitHub state changed.
- **Correction:** Inspect the tool schema and retry with the documented parameter name only if the PR snapshot is still needed.
- **Remaining risk:** None from the rejected read-only query.
