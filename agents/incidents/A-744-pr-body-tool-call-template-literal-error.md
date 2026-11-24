### A-744 — 2026-11-17 — Codex / BCHEN-W10 — PR creation call failed on an unescaped Markdown code marker

- **What failed:** The first draft-PR tool invocation embedded a Markdown inline-code backtick inside a JavaScript template literal. The script parser rejected it before the GitHub connector was called.
- **Impact:** No PR or external state was created by the failed call; one avoidable retry.
- **Agent-controlled cause:** I did not escape the body text for the JavaScript string delimiter.
- **Correction / remaining risk:** I will retry with plain quoted text that contains no unescaped delimiter. Low.
