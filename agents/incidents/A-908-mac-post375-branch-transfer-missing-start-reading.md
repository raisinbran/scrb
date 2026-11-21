### A-908 — 2026-11-20 — Codex Desktop — Mac branch-transfer task start usage reading omitted

- **Status / attribution:** Confirmed reporting omission; no application or user-data impact.
- **What failed:** I began this branch-transfer task by inspecting the PR #375 handoff and local reservation records without first reading the supported quota surface and PT clock, as the task reporting rule requires.
- **Impact:** The exact task-start PT timestamp and five-hour/weekly remaining allowances are unavailable. Start-to-end allowance changes and whether a quota reset crossed during this task cannot be calculated.
- **Correction / remaining risk:** I recorded the end reading and will preserve the start fields as unavailable with their specific reason. The source records and prior usage row were transferred only to the separate staging branch; PR #375 was not changed. Low.