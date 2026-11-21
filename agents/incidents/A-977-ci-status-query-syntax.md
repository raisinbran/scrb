### A-977 — 2026-11-18 — ChatGPT Chat / cloud — malformed read-only CI-status query
- **What failed:** During PR #361 verification-cache remediation, one read-only status-check script was rejected with `SyntaxError: Unexpected token ')'` before it could query GitHub.
- **Impact:** One preventable tool invocation and retry; no repository file, CI run, PR status, model, recording or user data was changed.
- **Agent-controlled cause:** A closing parenthesis was misplaced in the small JavaScript result-formatting expression.
- **Correction:** Used a syntactically valid query on the following call; the CI state was read successfully without changing tests or source.
- **Remaining risk:** None from this query; quota impact unknown because ChatGPT Chat exposes no five-hour/weekly meter.

- **ID reconciliation (2026-11-20 PT):** This is the original PR #361 incident previously recorded as A-786. It was renumbered to A-977 because PR #366 independently reserves A-786 for a different event. The prior heading, narrative and identifier remain recoverable from PR #361 Git history; none of the original event's evidence or attribution was discarded.
