### A-413 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — three avoidable CI runs on the save-dialog PR
- **Status / attribution:** Confirmed agent error. Fixed within the same PR. No product defect.
- **What failed:** Prettier was not run on the changed files before the first push, and a reveal-path test compared temp paths without resolving Windows short names (RUNNER~1) or macOS /private links.
- **Impact:** Three failed CI runs on the PR (one formatting, two Windows test) and about 15 minutes of waiting; the later runs would have passed with a local Prettier run and `realpathSync.native` from the start.
- **Source evidence:** PR cuc/save-dialog-slice1 check runs 43701024570, 43701166983, 43701617270.
- **Correction / remaining risk:** Formatting applied; test now compares native real paths. Low risk. Run Prettier on changed files before pushing and compare temp paths through `realpathSync.native`.
