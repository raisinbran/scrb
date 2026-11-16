### A-546 — 2026-11-16 — Codex / BCHEN-W10 — PR body update changed draft state

- **Status / attribution:** Confirmed agent/tool workflow error; no application defect.
- **What failed:** A body-only update to PR #324 unexpectedly returned the PR as ready for review even though no draft-state transition was requested.
- **Impact:** PR #324 briefly left draft status while CI and review were still pending. It was immediately converted back to draft; no merge or approval occurred.
- **Correction / remaining risk:** Restored draft status and verified the PR is open, unmerged, and draft. Avoid further description updates unless followed by a draft-state verification. Low.
