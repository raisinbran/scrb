### A-589 — 2026-11-16 — Codex / Mac — format check included native languages without parsers

- **Status / attribution:** Confirmed check selection error; no repository state changed by the check.
- **What failed:** I passed Swift, C/C++ and PowerShell files to Prettier, which has no configured parser for those languages; it also identified formatting needs in changed JavaScript and Markdown files.
- **Impact:** The combined formatting check exited nonzero before providing a clean result.
- **Correction / remaining risk:** Restrict Prettier to supported changed files, format only those files, then rerun lint. Native source formatting remains governed by its compiler and existing style. Low.
