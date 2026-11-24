### A-1127 — 2026-11-22 — Codex Desktop / Windows — usage-row formatter failed before GitHub write

- **Agent:** Codex (Codex Desktop, GPT-6, BCHEN-W10 Windows)

- **Status / attribution:** Confirmed agent-caused reporting-script error.
- **What failed:** The JavaScript draft-building call embedded a literal Markdown backtick in a template string and evaluated it as syntax; the function call threw before invoking the GitHub create-file API.
- **Impact:** No file or commit was created by the failed call, and no workspace or repository file was changed. A short delay only.
- **Agent-controlled cause:** Did not escape Markdown code formatting in the orchestration string.
- **Correction / remaining risk:** Switched to plain text content and will verify the file-creation result before opening the reporting PR. Low.
