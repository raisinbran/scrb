### A-955 — 2026-11-20 — Codex Desktop — Invalid tool-runner pragma rejected the diagnostic call

- **Status / attribution:** Confirmed tool-call formatting error; no command ran.
- **What failed:** A `functions.exec` directive used an unsupported pragma value and was rejected by the tool grammar.
- **Impact:** One no-op tool call.
- **Correction / remaining risk:** Reissued the command with a valid output-budget directive. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-892 was reassigned to A-955 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
