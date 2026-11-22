### A-1020 — 2026-11-21 — cloud GitHub — incident-template expression failed before GitHub publication

- **Failure and attribution:** The first JavaScript template used for the A-1019 incident contained unescaped Markdown backtick delimiters. The tool invocation failed with a SyntaxError before any GitHub operation or file mutation. This was an avoidable cloud authoring error.
- **Observed effect:** One rejected tool invocation and immediate syntactic correction; no tests, installers, branches, artifacts or user data modified.
- **Correction:** Reissued both new incident records using delimiter-safe text. Preserved original attempt details rather than merging this mistake into the underlying branch-name incident.
- **Prevention:** Avoid or escape nested template delimiters in Code Mode GitHub file content expressions; validate snippets before submission.
- **Remaining risk:** None beyond the wasted invocation. ID subject to reservation recheck before merge.
