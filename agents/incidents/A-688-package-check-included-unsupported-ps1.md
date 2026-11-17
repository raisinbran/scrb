### A-688 — 2026-11-16 — Codex / BCHEN-W10 — Prettier check included unsupported PowerShell file

- **Status / attribution:** Confirmed agent check-command error; the source files were not changed by the failed check.
- **What failed:** A focused formatting check included `scripts/package-win.ps1`; Prettier exited with “No parser could be inferred” for that PowerShell file. It also identified formatting in the modified JavaScript files.
- **Agent-controlled cause:** I passed a PowerShell file to Prettier, which has no parser configured for it.
- **Impact:** The combined verification command stopped before ESLint, register validation and whitespace checks ran.
- **Correction / remaining risk:** I formatted and checked only supported JavaScript files, then reran focused tests, ESLint, register validation, PowerShell syntax parsing and `git diff --check`; all passed. The plan document was not blanket-formatted. Low.
