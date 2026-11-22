### A-1067 — 2026-11-22 — cloud #419 single-runner source — test-file authoring quote error

- **Observed failure:** Initial attempt to publish the standalone workflow regression test aborted with a JavaScript `SyntaxError: Invalid or unexpected token` before any repository mutation.
- **Cause:** A stray quoted `.replace(...)` cleanup expression in the authoring script was malformed. The intended JavaScript test body was not itself executed.
- **Effect:** One failed source-preparation invocation; no Git, CI or Windows runner action from that attempt.
- **Correction:** Removed the malformed authoring expression, submitted the focused Vitest source directly and verified its branch commit. Added Windows-only invented PowerShell regression entry; no private candidate was created.
- **Residual:** Synthetic behavior and full exact-head CI remain unverified pending checks.
