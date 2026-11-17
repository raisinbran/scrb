### A-611 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — focused Speakers Electron suite

- The focused Electron suite built the app, but all three Playwright cases ended with `Process failed to launch!` before app startup. No layout assertions ran locally.
- Kept the failure evidence and used the required exact-head Mac/Windows CI jobs to execute the Electron tests; no automatic local rerun. The CI result will determine remaining verification risk.
