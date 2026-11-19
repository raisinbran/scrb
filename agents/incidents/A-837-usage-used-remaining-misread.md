### A-837 — 2026-11-18 — quota used percentage was reported as remaining

- **Status / attribution:** Confirmed agent reporting error; no account setting changed.
- **What failed:** I read `usedPercent: 2` from Codex's limits response as 2% remaining instead of calculating 98% remaining.
- **Impact:** I stopped the requested work prematurely and told the owner the allowance was near exhaustion. The owner corrected the interpretation; a fresh read confirmed 98% five-hour and 61% weekly remaining.
- **Correction / remaining risk:** Resume from the stable W2 branch, use `100 - usedPercent` for both windows, and report this correction. Low.
