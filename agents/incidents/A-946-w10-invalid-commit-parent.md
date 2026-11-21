### A-946 — 2026-11-20 — W10 — Commit creation used a mistyped parent SHA

- **Status / attribution:** Confirmed agent invocation error; GitHub rejected the commit request.
- **What failed:** The parent SHA passed to the commit API omitted characters and failed GitHub's 40-character SHA validation.
- **Impact:** The commit was not created and the PR branch ref did not move. The already-created tree object is unreachable and harmless.
- **Correction / remaining risk:** Verify the current PR head from GitHub and assert its 40-character value before retrying the commit request. Low.

