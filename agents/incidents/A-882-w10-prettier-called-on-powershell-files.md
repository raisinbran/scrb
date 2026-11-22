### A-882 — 2026-11-20 — W10 — Prettier check included unsupported PowerShell files

- **Status / attribution:** Confirmed validation-command error; no repository file was changed by the command.
- **What failed:** A Prettier check included `*.ps1` and `*.psm1` files, but the installed Prettier configuration has no PowerShell parser and rejected those paths.
- **Impact:** One unnecessary failed formatting command; PowerShell source parsing and behavior were unaffected.
- **Correction / remaining risk:** Reran Prettier only on the workflow YAML and JavaScript test file, which passed. PowerShell syntax was checked with the PowerShell parser. Low.
- **Publication:** Included in the W10 smoke-test correction PR; local and unpublished until that PR update is reviewed and merged.

