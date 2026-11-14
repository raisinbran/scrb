### A-391 — 2026-11-14 — Codex — Open PR scan treated file objects as strings

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** The first `gh pr list --json files` filter passed each returned file object directly to a regular-expression matcher, which expects a string.
- **Impact:** The scan stopped with a Python `TypeError`; no PR or repository state changed.
- **Correction / remaining risk:** Read each file object's `filename` field and repeated the scan; it found no A-391-or-higher incident files among the open PRs. None.
