### A-568 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — exact-head CI formatting check

- **Status / attribution:** Confirmed author formatting omission; no application defect.
- **What failed:** Exact-head macOS and Windows CI stopped at the changed-file Prettier check because the new rendered-bounds assertion was not formatted with the repository's required wrapping.
- **Impact:** Both CI jobs skipped typecheck, lint, tests, and build on that attempt.
- **Correction / remaining risk:** Applied the repository formatter to the changed TypeScript file; rerun local format and automated checks, then obtain exact-head CI. Low.
