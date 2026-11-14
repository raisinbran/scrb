### A-372 — 2026-11-14 — Codex / Mac desktop — CI status query used an unsupported tool name
- **Status / attribution:** Confirmed agent tool-selection error; no application defect.
- **What failed:** I called a nonexistent workflow-run tool name while checking CI progress; the call failed before making any external change.
- **Impact:** No status was returned by that call.
- **Correction / remaining risk:** Used the available `fetch_commit_workflow_runs` and `fetch_workflow_run_jobs` tools. Low.
