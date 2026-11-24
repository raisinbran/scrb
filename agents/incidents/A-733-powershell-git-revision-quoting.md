### A-733 — 2026-11-17 — Codex / BCHEN-W10 — PowerShell parsed an unquoted Git revision expression

- **What failed:** A read-only `git cat-file -e <sha>^{commit}` probe was passed without quoting the revision expression. PowerShell treated the braces as syntax and the command failed before checking the object.
- **Impact:** One invalid repository-inspection command and an avoidable correction.
- **Agent-controlled cause:** I did not quote a Git revision expression for PowerShell.
- **Correction / remaining risk:** The branch HEAD and object were verified with `git rev-parse`; no repository state changed. Low.
