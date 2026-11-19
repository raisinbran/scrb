### A-813 — 2026-11-18 — focused W2 test blocked by Vitest token permissions

- **Status / attribution:** Confirmed setup error; no product defect.
- **What failed:** The first focused Vitest invocation could not create its API token in the sandbox.
- **Impact:** That invocation produced no test result.
- **Correction / remaining risk:** Re-ran the same focused test with the required filesystem access; all 4 tests passed. Low.
