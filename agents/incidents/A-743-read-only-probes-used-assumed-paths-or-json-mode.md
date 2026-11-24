### A-743 — 2026-11-17 — Codex / BCHEN-W10 — read-only probes used assumed paths and JSON mode

- **What failed:** Several read-only probes referenced non-existent source paths, and the first `ConvertFrom-Json` package-lock inspection did not account for an empty-name property that PowerShell requires `-AsHashtable` to parse.
- **Impact:** The probes returned path/parse errors before answering their intended checks; no files or Git state changed.
- **Agent-controlled cause:** I inferred paths and JSON handling instead of checking tracked paths and the PowerShell parser behavior first.
- **Correction / remaining risk:** I located the actual manifest/source files, inspected the script, and reran the lock comparison with `-AsHashtable`. Low.
