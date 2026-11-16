### A-572 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Settings visual regression

- The first Settings Electron regression asserted that the Microphone and Meeting app selectors had different vertical positions, overlooking that both controls intentionally share a row in the existing two-column field grid. The assertion failed despite the UI layout being correct.
- Updated the check to assert both selectors follow the non-profile controls and that Test mic follows the selector row; retry the Electron regression.
