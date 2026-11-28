### A-1233 — 2026-11-27 — Claude Code — Usage meter not read at task start

- **Agent:** Claude
- **Attribution:** Confirmed self-induced reporting omission. The banner-dismiss task started without a `get_usage` reading.
- **Evidence:** First usage read happened after the work was done.
- **Impact:** The usage row has no start percentages; no technical effect.
- **Correction:** Row records start as unavailable and the end reading.
- **Remaining risk:** Low; read the meter before the first tool call.
