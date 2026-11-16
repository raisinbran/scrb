### A-547 — 2026-11-16 — Codex / BCHEN-W10 — redundant draft conversion call rejected

- **Status / attribution:** Confirmed tool-use error; no application defect.
- **What failed:** After a PR body update had already left #324 in draft state, I redundantly called the convert-to-draft action. The connector rejected the no-op call with a TypeError.
- **Impact:** One failed state-management call; PR #324 remained open, unmerged, and draft. No repository or CI state changed.
- **Correction / remaining risk:** Verified #324 is still draft and stopped issuing draft-state changes unless a state check shows one is needed. Low.
