### A-344 — 2026-11-13 — Claude Code (Sonnet 5.5) / Mac desktop — overlap-order plan: usage not read at start
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I did not call `get_usage` before starting the task, so start allowances are unavailable. The only reading was taken near the end of the work.
- **Impact:** The usage row has no start figures and cannot show this task's cost.
- **Correction / remaining risk:** Row says so; read `get_usage` first on the next task. Low.
