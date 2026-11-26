### A-720 — 2026-11-17 — Codex / Mac — Electron executable probe used wrong workspace path
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** A read-only availability probe looked for Electron under `apps/desktop/node_modules`, while the repository's `scripts/m1.sh` expects the root `node_modules/electron` path.
- **Impact:** The probe incorrectly reported the Electron executable absent; it did not launch or modify any app.
- **Correction / remaining risk:** Read the launcher path before deciding whether the development environment was complete. Low.
