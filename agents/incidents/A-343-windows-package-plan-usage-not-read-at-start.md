### A-343 — 2026-11-13 — Claude Code (Sonnet 5.5) / Mac desktop — Windows packaging plan: usage not read at task start
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I did not call `get_usage` before starting, against the measure-at-start rule, and read it only after reading most of the code.
- **Impact:** Start-of-task allowance is unavailable; the usage row has mid-task and end values only.
- **Correction / remaining risk:** Logged as unavailable. Low. Renumbered from A-340 at the main refresh because main already used A-340.
