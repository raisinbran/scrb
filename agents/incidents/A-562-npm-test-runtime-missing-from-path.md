### A-562 — 2026-11-15 — Codex / Mac desktop — npm test could not find the pinned Node runtime

- **Status / attribution:** Confirmed task setup error; the test process did not start.
- **What failed:** I launched npm through the explicit Node binary, but the npm script uses `env node` for its Vitest executable and the managed shell's `PATH` did not include the pinned Node directory.
- **Impact:** The focused test command exited before running Vitest; no test result was produced.
- **Correction / remaining risk:** Retry the focused test with the repository-pinned Node directory prepended to `PATH`. Low.
