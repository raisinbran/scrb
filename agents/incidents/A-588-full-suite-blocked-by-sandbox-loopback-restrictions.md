### A-588 — 2026-11-16 — Codex / Mac — full suite blocked by sandbox loopback restrictions

- **Status / attribution:** Confirmed environment limitation; failures were in existing worker tests.
- **What failed:** `npm run check` passed type-check and lint, then several worker tests failed because the sandbox denied `127.0.0.1` listeners with `EPERM`; the run stopped producing output while those tests waited on blocked servers.
- **Impact:** The full suite did not reach the boundary and register checks.
- **Correction / remaining risk:** Interrupted the stalled run and executed the focused recording and Live-screen suites instead (77 passed, 1 skipped). Full-suite CI on GitHub remains required. Low for this change; full local suite is unverified.
