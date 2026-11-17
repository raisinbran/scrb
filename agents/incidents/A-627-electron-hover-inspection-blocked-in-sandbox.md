### A-627 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — baseline hover inspection

- **Status / attribution:** Confirmed sandbox execution restriction; no application defect or app-state change.
- **What failed:** Playwright could not launch the isolated Electron mock app inside the restricted command sandbox.
- **Impact:** That attempt produced no hover measurements or screenshots.
- **Correction / remaining risk:** Rerun the same inspection with scoped elevated execution; keep the temporary user-data directory and library isolated from the active Scribe session. Low.
