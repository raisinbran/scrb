### A-909 — 2026-11-20 — W10 — usage row closed before final PR verification

- **What failed:** I recorded the task end and account readings before completing the final PR-head and dirty-checkout verification.
- **Impact:** The first usage row understated the actual task interval and one shared-account five-hour percentage-point change. No source, candidate, or test result was affected.
- **Correction / remaining risk:** Replaced the row in the normal PR branch with the final check time/readings. Account-level changes remain shared and cannot be attributed to this task. Low.
- **Publication:** Included with the corrected usage row in the Windows M1 PR #376 reporting update; pending normal PR review.
