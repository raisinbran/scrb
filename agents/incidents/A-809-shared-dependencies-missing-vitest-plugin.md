### A-809 — 2026-11-18 — Codex Desktop / MacBook Air M5 — shared dependency tree lacked a Vitest workspace plugin

- **Status / attribution:** Confirmed test setup limitation; no product defect.
- **What failed:** The first Vitest run loaded the repository-wide workspace config through a linked dependency tree that lacked `@vitejs/plugin-react`.
- **Impact:** The repository-wide Vitest configuration could not initialize. No tests ran in that attempt.
- **Correction / remaining risk:** Ran the targeted test file with a temporary scripts-only Vitest config; all focused tests passed. The full repository suite remains unverified in this checkout. Low.
