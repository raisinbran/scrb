### A-533 — 2026-11-16 — Codex / BCHEN-W10 — failed patch context for Node runtime extraction

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** An `apply_patch` attempt to extract the existing PowerShell Node-selection block used an exact hunk that did not match the worktree's source text. The patch was rejected without changing files.
- **Impact:** One failed edit attempt and a short delay.
- **Correction / remaining risk:** Re-read the committed driver and applied a bounded line replacement, then added a shared committed helper and a PowerShell regression script. The focused PowerShell checks pass; no recording or broad suite was run.
