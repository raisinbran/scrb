# A-920 — Handoff Markdown code spans initially over-escaped
- **Date / surface:** 2026-11-20 PT; cloud GitHub documentation handoff authoring.
- **Observed error:** The first commit of `docs/handoffs/2026-11-20-m1-v1-ui-packaged-copy-session-handoff.md` used a raw template literal and retained 92 unnecessary backslashes before Markdown backtick markers. Those markers would have displayed literally instead of formatting code spans in GitHub.
- **Cause:** Code-mode string escaping was carried into file content without checking final rendered Markdown syntax.
- **Correction:** Inspected the committed source and removed all 92 extraneous escape characters in follow-up commit `a9fd0fd0b1cc94626efa5a9f67c2c4307972628e` before creating the pull request; the content and evidence references remain unchanged.
- **Impact:** One unnecessary GitHub file-update commit and connector calls; no application source changes, CI rerun, PR merge, host access or user recording modifications. There was no owner-visible published PR artifact before correction.
- **Remaining risk:** Rendered-link and code-span quality should still be checked in formal document review. No exact task-only allowance consumption can be attributed from the shared account.
- **Publication:** New draft handoff PR branch only, not main; unique identifier rechecked against main and known active published coordination inventory.
