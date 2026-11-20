### A-917 — 2026-11-20 — Cloud incident log script contained an unescaped code delimiter

- **Classification:** Self-induced JavaScript orchestration parse failure, unrelated to Scribe runtime or CI.
- **What failed:** The first attempt to record the PR #383 Prettier incident embedded backtick-delimited code in a JavaScript template literal without escaping it. The Code Mode parser rejected the statement (`Unexpected identifier 'Check'`) before invoking GitHub.
- **Impact:** One wasted cloud documentation call; no repository state, tests, user data or device operations changed in the rejected attempt.
- **Correction:** Rewrote the log as an array of ordinary quoted strings joined by newlines. The correctly formatted A-916 record was subsequently committed to the unreviewed coordination branch.
- **Prevention:** Escape source-code delimiters when embedding documents in JavaScript, or use safely quoted arrays for static Markdown.
- **Publication:** On the unreviewed coordination branch, not main; separate from functional tooltip regression work.
