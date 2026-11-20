### A-855 — 2026-11-19 — W10 — preflight PowerShell loop did not parse

- **Status / attribution:** Confirmed diagnostic-command error; no repository state changed.
- **What failed:** The initial batched PowerShell command piped directly from a `foreach` statement, producing a parser error before its requested checks ran.
- **Impact:** None beyond one unsuccessful diagnostic attempt; no files were changed.
- **Correction / remaining risk:** Reissued the checks as separate valid PowerShell commands. Low.
