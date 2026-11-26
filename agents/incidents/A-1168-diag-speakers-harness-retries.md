### A-1168 — 2026-11-25 — Mac — Three avoidable harness retries during the speaker diagnosis

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **Attribution:** Confirmed self-induced test-harness errors: ran the headless scripts with Node's strip-only TypeScript mode (the transcription sources use parameter properties and `.js` import specifiers), ran `node` without the project PATH in one command, and passed no meeting id to the first storage reproduction.
- **Evidence:** `ERR_MODULE_NOT_FOUND`, `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, `command not found: node`, and a SQLite bind error on an undefined id.
- **Impact:** Three extra short runs; no data touched, no application defect misreported.
- **Correction:** Added a `.js` to `.ts` resolver hook, used transform mode and the documented Node PATH, and passed the id explicitly.
- **Remaining risk:** Low.
