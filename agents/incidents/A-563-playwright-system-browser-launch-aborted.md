### A-563 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — headless visual bounds check

- **Status / attribution:** Confirmed QA setup failure; no application defect.
- **What failed:** The first headless Playwright run using the installed system Chrome binary inside the restricted command sandbox aborted at startup with `SIGABRT` before opening the local mock app.
- **Impact:** That attempt produced no DOM measurements; no app behavior was affected.
- **Correction / remaining risk:** After confirming local-server tests needed socket access, one scoped escalated measurement run opened the same browser and returned the DOM bounds. The Live centerline difference is 2.87 CSS px and the banner is 448 px at 13 px. Low.
