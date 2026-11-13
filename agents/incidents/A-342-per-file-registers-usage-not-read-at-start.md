### A-342 — 2026-11-13 — Claude Code (Sonnet 5.5) / Mac desktop — per-file registers: usage not read at task start
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I called `get_usage` only after reading and editing files, against the measure-at-start rule.
- **Impact:** Start-of-task allowance is unavailable; the usage row has end values only.
- **Correction / remaining risk:** Logged as unavailable. Low.
