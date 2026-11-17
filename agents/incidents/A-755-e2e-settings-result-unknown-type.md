### A-755 — 2026-11-17 — Codex Desktop / BCHEN-W10 — startup test did not narrow the settings result type

- **What failed:** The first `npm run check` stopped at desktop typecheck because the startup E2E test read `value.location` from an invocation result typed as `unknown`.
- **Agent-controlled cause:** I relied on the preceding runtime assertion to narrow a TypeScript type it cannot narrow.
- **Impact:** That check attempt did not reach lint, unit tests, or register checks.
- **Correction / remaining risk:** Added an explicit local result shape after the success guard. The focused runtime test had already passed; the full check is being rerun once after this correction. Low.
