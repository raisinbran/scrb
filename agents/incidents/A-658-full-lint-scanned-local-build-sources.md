### A-658 — 2026-11-16 — Codex / BCHEN-W10 — Full lint scanned local build and upstream source artifacts

- **Observed effect:** The requested `npm run check` stopped at `eslint .` with 2,047 errors across generated `apps/desktop/build` output and the temporary upstream Whisper source checkout; type checking had completed successfully, while tests and later check steps were not reached.
- **Evidence:** `build/check-slice2.log`; the reported paths include `apps/desktop/build/diag-electron-absolute/main.js` and `upstream/whisper.cpp/tests/test-whisper.js`.
- **Attribution:** Agent workspace setup left local build/source artifacts inside paths traversed by the repository-wide lint command; the errors are not evidence of lint failures in committed source.
- **Correction:** Run targeted lint on changed source files and the remaining relevant checks, then rely on exact-head CI in a clean checkout for the full repository check.
- **Remaining risk:** The local full-check command remains unusable while these preserved artifacts are present; CI will show the clean-checkout result.
