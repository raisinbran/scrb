### A-812 — 2026-11-18 — focused W2 test invoked through a nonexistent path

- **Status / attribution:** Confirmed agent command error; no product defect.
- **What failed:** I tried to invoke Vitest from `apps/desktop/node_modules/vitest/vitest.mjs`, but this workspace installs dependencies at the repository root.
- **Impact:** The test command failed before running tests.
- **Correction / remaining risk:** Located the root npm script and ran the focused test successfully (4 passed). Low.
