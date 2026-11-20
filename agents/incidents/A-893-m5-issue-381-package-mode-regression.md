### A-893 — 2026-11-20 — Codex Desktop — Focused PR dropped the macOS packaging script executable mode

- **Status / attribution:** Confirmed agent-caused publication error found by independent review; no package was run from the PR branch and no installed app was changed.
- **What failed:** When creating the focused PR tree through the GitHub connector, I set every entry to mode `100644`, including `scripts/package-mac.sh`, whose source mode is `100755` and whose header documents direct Terminal invocation.
- **Impact:** The PR version would fail with permission denied when invoked as documented.
- **Correction / remaining risk:** Restore `100755` on the PR branch, rerun exact-head CI, and request independent re-review. No production behavior or candidate app was changed. Low after the fix is verified.
