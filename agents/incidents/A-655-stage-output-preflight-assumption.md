### A-655 — 2026-11-16 — Codex / BCHEN-W10 — Staging output preflight expected an output directory to exist

- **Observed effect:** A local preflight stopped before invoking the staging tool because it required the `bin` output directory to exist, although the staging implementation creates it.
- **Evidence:** PowerShell reported the absent output path. The prior output remains preserved at `bin-direct-check`.
- **Attribution:** Agent command preflight assumption; no project defect.
- **Correction:** Require only the staging parent to exist and let `stageWindowsTools` create the new output directory.
- **Remaining risk:** None from this stopped preflight.
