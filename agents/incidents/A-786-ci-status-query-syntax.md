### A-786 — 2026-11-18 — ChatGPT Chat / cloud — malformed read-only CI-status query
- **What failed:** During PR #361 verification-cache remediation, one read-only status-check script was rejected with `SyntaxError: Unexpected token ')'` before it could query GitHub.
- **Impact:** One preventable tool invocation and retry; no repository file, CI run, PR status, model, recording or user data was changed.
- **Agent-controlled cause:** A closing parenthesis was misplaced in the small JavaScript result-formatting expression.
- **Correction:** Used a syntactically valid query on the following call; the CI state was read successfully without changing tests or source.
- **Remaining risk:** None from this query; quota impact unknown because ChatGPT Chat exposes no five-hour/weekly meter.
