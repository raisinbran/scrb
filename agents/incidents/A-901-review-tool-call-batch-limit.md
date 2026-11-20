### A-901 — 2026-11-19 — Oversized GitHub file-reading batch rejected during PR #373/#374 review

- **Classification:** Confirmed read-only orchestration error in this cloud review session. No repository or device state changed.
- **Event:** A single code-mode batch attempted parallel `fetch_file` calls for every changed file in both accounting PRs. The orchestrator rejected the batch with `Code Mode exceeded the maximum number of tool calls` before returning file content.
- **Impact:** One wasted read-only call and loss of that batch's output. No CI rerun, installation, PR edit, GitHub review, or recording was caused by the error.
- **Correction:** Used one supported `fetch_pr_patch` call per PR and independently examined the complete 14-file and 5-file documentation changes before formal reviews. Existing CI and source heads were left unchanged.
- **Evidence:** [PR #373 formal review #5987187947](https://github.com/raisinbran/scrb/pull/373#pullrequestreview-5987187947), [PR #374 formal review #5987188567](https://github.com/raisinbran/scrb/pull/374#pullrequestreview-5987188567), and coordinator task row `2026-11-19-w10-and-mac-a2-review-coordination.md`.
- **Publication:** Provisional on unreviewed cloud coordination branch only; not on main. Identifier A-901 checked against current main and the coordination branch, but unexposed machine-local reservations remain unknown and must be reconciled before any reviewed merge.
