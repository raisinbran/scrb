### A-873 — 2026-11-19 — W10 — first smoke-test formatting check found style differences

- **Status / attribution:** Confirmed formatting issue in the new targeted Vitest file; no test behavior or product code was affected.
- **What failed:** The initial Prettier check reported formatting differences in `scripts/test-win-installer-smoke.test.mjs`.
- **Impact:** One failed formatting check.
- **Correction / remaining risk:** Formatted the test and workflow files, then reran Prettier successfully. The focused four-test Vitest file and PowerShell parser also passed afterward. Low.
- **Publication:** Local and unpublished in `agents/incidents/`; included in the W10 installer-smoke reporting PR branch.

