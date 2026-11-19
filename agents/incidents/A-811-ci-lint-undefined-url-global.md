### A-811 — 2026-11-18 — Codex Desktop / MacBook Air M5 — exact-head CI found an undefined URL global in a test

- **Status / attribution:** Confirmed test-authoring error; no product defect.
- **What failed:** Exact-head Windows and macOS CI stopped at ESLint because the new packaging test used `URL` without declaring it in the project's configured globals.
- **Impact:** Both checks failed before the test suite ran.
- **Correction / remaining risk:** Import `fileURLToPath` from `node:url`, construct the test path with `node:path`, then rerun the focused lint and test checks and exact-head CI. Low.
