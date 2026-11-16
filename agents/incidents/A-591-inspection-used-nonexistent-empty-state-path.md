### A-591 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — locating the shared EmptyState component

- **Status / attribution:** Confirmed inspection-path error; no application files changed.
- **What failed:** An inspection command assumed `EmptyState` had its own component file; the component is actually exported from `screens/Screen.tsx`.
- **Impact:** That read command returned file-not-found errors before the correct source was located.
- **Correction / remaining risk:** Located and read `Screen.tsx` and `Screen.module.css`, which supply the standard and compact empty-state styles. Low.
