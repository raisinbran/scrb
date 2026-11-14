### A-369 — 2026-11-14 — Codex / Mac desktop — read-only Node inspection omitted the configured shim path
- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** A read-only lockfile comparison invoked `node` without adding the repository's configured Node 22 shim directory to `PATH`; the shell could not find the command.
- **Impact:** The comparison did not run; no files were changed by that command.
- **Correction / remaining risk:** Repeated the inspection with the configured shim path. Low.
