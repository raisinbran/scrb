### A-806 — 2026-11-18 — Codex Desktop / MacBook Air M5 — task-start quota reading captured after initial inspection

- **Status / attribution:** Confirmed reporting-timing error; no application defect.
- **What failed:** I began the packaging PR repository and candidate inspection before capturing the task-start usage display.
- **Impact:** Exact start-time five-hour and weekly remaining allowances are unavailable. The first available reading was 90% five-hour and 63% weekly remaining, after initial inspection.
- **Correction / remaining risk:** Keep the start allowance marked unavailable, record the first observed reading separately, and capture an end reading. Low.
