### A-1222 — 2026-11-27 — Claude Code (Sonnet 5.5) / Mac desktop — boundary fix: no usage reading at task start
- **Agent:** Claude (Sonnet 5.5, Mac worktree session)
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I did not read `get_usage` at task start, as the usage rule requires, so start percentages are unavailable.
- **Impact:** The usage row has end readings only.
- **Correction / remaining risk:** Recorded as unavailable. No remaining risk.
