### A-892 — 2026-11-20 — Codex Desktop — Invalid tool-runner pragma rejected the diagnostic call

- **Status / attribution:** Confirmed tool-call formatting error; no command ran.
- **What failed:** A `functions.exec` directive used an unsupported pragma value and was rejected by the tool grammar.
- **Impact:** One no-op tool call.
- **Correction / remaining risk:** Reissued the command with a valid output-budget directive. Low.
