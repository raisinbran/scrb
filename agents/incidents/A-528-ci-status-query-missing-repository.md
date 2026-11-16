### A-528 — 2026-11-16 — Codex / BCHEN-W10 — omitted repository parameter in CI status query

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** One read-only GitHub workflow-status query omitted its required `repo_full_name` argument and was rejected by connector schema validation.
- **Impact:** One unnecessary failed status lookup; no repository or CI state changed.
- **Correction / remaining risk:** Repeated the query with `repo_full_name=raisinbran/scrb`; it returned the expected exact-head workflow status. Low.
