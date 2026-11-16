### A-552 — 2026-11-15 — Codex / model unavailable / Mac local — summary download UI focused-test setup and expectation

- **Status / attribution:** Confirmed test-authoring errors; no application defect.
- **What failed:** The first focused test run had two failures. The new app-navigation integration test did not wrap `App` in `ThemeProvider`, which is required when navigation mounts Settings. The checksum test expected wording different from the existing shared `failureText` copy.
- **Impact:** Two focused tests failed; no product behavior or shared checkout was affected.
- **Correction / remaining risk:** Wrapped the integration test app in `ThemeProvider` and matched the checksum assertion to the current shared copy. Low.
