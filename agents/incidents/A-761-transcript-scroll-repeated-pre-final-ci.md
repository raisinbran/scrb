### A-761 — Intermediate PR updates launched redundant CI runs

- **Status / attribution:** Confirmed avoidable scheduling inefficiency in the PR #352 implementation workflow; no code or recording loss.
- **What happened:** PR #352 was opened before the author completed the saved-transcript alignment and design-guide updates. Further incremental commits triggered overlapping GitHub Actions runs for superseded heads, including [44200031136](https://github.com/raisinbran/scrb/actions/runs/44200031136), [44200090991](https://github.com/raisinbran/scrb/actions/runs/44200090991) and [44200127406](https://github.com/raisinbran/scrb/actions/runs/44200127406). The final code requires one new exact-head run regardless.
- **Cause:** The branch was published for CI before the changes and regression tests were stabilized. GitHub automatically schedules CI on each PR head update.
- **Impact:** Unnecessary CI queue occupancy and potential runner time; the cost and interference with other jobs are not measured.
- **Correction / prevention:** Stabilize source, tests, and documentation on an isolated feature branch before opening a draft PR; avoid repeated PR-head updates for nonessential changes. Use only final-head CI for the merge gate and do not infer failures from superseded commits.
