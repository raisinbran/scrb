### A-724 — 2026-11-17 — Codex / BCHEN-W10 — malformed Vitest source search

- **What failed:** A PowerShell-style wildcard was passed literally to `rg`, so the diagnostic search returned an invalid-path error and did not inspect the requested Vitest source files.
- **Impact:** One failed read-only search; no project files changed.
- **Agent-controlled cause:** Used a shell wildcard form that `rg` does not expand on Windows.
- **Correction / remaining risk:** Repeated the search with the exact known source path. Low.
