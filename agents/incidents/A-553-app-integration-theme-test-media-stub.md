### A-553 — 2026-11-15 — Codex / model unavailable / Mac local — app integration theme provider needed media-query stub

- **Status / attribution:** Confirmed test-harness setup error; no application defect.
- **What failed:** After adding `ThemeProvider` to the App integration harness so the new Settings navigation case could render, the existing 13-test integration suite failed because `window.matchMedia` was not stubbed.
- **Impact:** One focused rerun failed across the App integration suite before meaningful assertions; product files were unaffected by the failure.
- **Correction / remaining risk:** Stubbed `matchMedia` for this suite and restore globals after each test, matching the existing focused Settings test pattern. Low.
