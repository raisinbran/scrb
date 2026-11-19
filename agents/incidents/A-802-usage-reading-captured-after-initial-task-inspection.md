### A-802 — 2026-11-18 — Codex Desktop / MacBook Air M5 — task-start quota reading captured after initial repository inspection

- **Status / attribution:** Confirmed reporting-timing error; no application defect.
- **What failed:** I began read-only repository and packaging inspection before capturing the start quota display, contrary to the mandatory task-start accounting rule.
- **Impact:** Exact five-hour and weekly remaining percentages at the task's first timestamp are unavailable. First observed usage was 96% five-hour and 64% weekly remaining at 17:23:04 PT, after the initial inspection.
- **Correction / remaining risk:** Keep the first timestamp and first observed usage reading distinct in the task row, capture the end reading, and identify the missing exact start allowance as unavailable. Low.

- **Publication ID reconciliation:** Published here as A-802; the original local candidate record A-792 remains unchanged. The original identifier overlapped the open incident set for PR #368.
