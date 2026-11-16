### A-597 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Speakers UI smoke test

- The first Electron UI run used `getByLabel('Meeting', { exact: true })`, but the native selector's accessible name includes its option prompt and does not exactly equal `Meeting`.
- The UI was unaffected; the test timed out before exercising layout bounds. Updated the locator to select the native `<select>` nested inside the Meeting label.
- Retry with the focused Electron regression suite.
