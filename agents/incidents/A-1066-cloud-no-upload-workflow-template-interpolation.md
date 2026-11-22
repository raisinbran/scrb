### A-1066 — 2026-11-22 — cloud #419 single-runner source — workflow authoring expression syntax

- **Observed failure:** First read-only/authoring attempt to submit the standalone workflow produced a JavaScript `SyntaxError: Unexpected token '.'` before reaching the GitHub write action.
- **Cause:** GitHub Actions interpolation markers `${{ ... }}` were placed directly into a JavaScript template literal, which tried to interpret them as JavaScript.
- **Effect:** One failed source-preparation invocation; no commit was created by that attempt. No workflow dispatch, installer, user account, external upload or owner-device access.
- **Correction:** Author the workflow with inert placeholders in the source-preparation layer, replace them with the literal GitHub Actions expression markers before publishing, and verify the resulting file on the isolated branch. No previous passing CI was rerun.
- **Residual:** Parser, CI and independent formal review required before merge; actual single-runner execution remains unauthorized.
