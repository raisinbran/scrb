### A-371 — 2026-11-14 — Codex / Mac desktop — SQLite wrapper passed an undefined options value

- **Status / attribution:** Confirmed implementation error, caught and fixed before commit.
- **What failed:** `openDatabase` passed its optional options argument to `DatabaseSync` when it was `undefined`; Node 22 rejects that call.
- **Impact / evidence:** The new POSIX library permission probes failed during library open; no existing library or recording was touched.
- **Correction / remaining risk:** Construct `DatabaseSync` with one argument when options are absent. The focused storage probes and storage typecheck then passed. None known.
