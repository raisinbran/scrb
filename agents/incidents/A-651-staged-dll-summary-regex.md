### A-651 — 2026-11-16 — Codex / BCHEN-W10 — PowerShell DLL summary regex matched no files

- **Effect:** A read-only summary command reported zero DLL and executable counts for the generated dependency audit; it changed no files and no report was published.
- **Evidence:** The PowerShell expression used a doubled backslash in a single-quoted regex, so it searched for a literal backslash before the file extension.
- **Cause:** I escaped the PowerShell regex as though the string parser treated backslashes as escapes.
- **Correction:** Recompute counts from the JSON with Node, where the expression can be tested directly.
- **Remaining risk:** None to the staged artifacts; their file list and smoke results are independently recorded in the audit JSON.
