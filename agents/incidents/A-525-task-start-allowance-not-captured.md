### A-525 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — task-start allowance snapshot not captured

- **Status / attribution:** Confirmed agent process error; no application defect.
- **What failed:** I began repository and instruction review before reading the account usage limits, contrary to the task-start measurement rule. The first usage reading was taken after work had begun.
- **Impact:** The true task-start five-hour and weekly remaining percentages are unavailable, so task consumption cannot be calculated. No repository, report, recording, or stash data was changed by this omission.
- **Correction / remaining risk:** The first available reading is recorded in this task's usage row, with the start values explicitly unavailable. Future work will capture the reading before substantive work. Low.
