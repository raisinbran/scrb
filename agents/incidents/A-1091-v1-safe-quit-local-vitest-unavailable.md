### A-1091 — 2026-11-22 — V1-B safe quit — local Vitest startup unavailable

- **What failed:** The targeted local Vitest command failed before test collection because the installed Rolldown package could not load its WASI native binding.
- **Attribution / impact:** Local test-environment limitation; no test assertion ran and no application or user data was involved. This environment failure is not evidence of a product defect.
- **Correction:** Did not reinstall dependencies or repeat the failing command. Exercised the guard with a Node source harness and retained exact-head CI as the required regression check.
- **Remaining risk:** The focused Vitest suite still requires the repository's CI environment to pass.
