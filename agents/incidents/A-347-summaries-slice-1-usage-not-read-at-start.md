### A-347 — 2026-11-13 — Claude Code (Sonnet 5.5) / Mac desktop — summaries slice 1: usage not read at start
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I did not call `get_usage` before starting the task, so the start percentages are unknown.
- **Impact:** The usage row has end figures only.
- **Correction / remaining risk:** End figures read and logged. Low.
