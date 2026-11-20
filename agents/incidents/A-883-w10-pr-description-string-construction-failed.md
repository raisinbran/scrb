### A-883 — 2026-11-20 — W10 — PR description string construction failed

- **Status / attribution:** Confirmed command-construction error; the GitHub update tool was not called by the failed command.
- **What failed:** The first attempt to update PR #376 embedded Markdown backticks inside a JavaScript template literal without escaping them, so the function script failed to parse.
- **Impact:** One failed PR-description preparation attempt; no remote or repository state changed.
- **Correction / remaining risk:** Rebuilt the description from plain string lines and the PR body update then succeeded. Low.
- **Publication:** Included in the W10 smoke-test correction PR; local and unpublished until that PR update is reviewed and merged.

