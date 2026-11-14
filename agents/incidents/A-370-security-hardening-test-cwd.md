### A-370 — 2026-11-14 — Codex / Mac desktop — focused Vitest filters used repository-relative paths

- **Status / attribution:** Confirmed test setup error; no application failure.
- **What failed:** I invoked workspace-specific Vitest configs from the repository root with repository-relative filters. The configs resolve their includes relative to the workspace, so Vitest found no test files.
- **Impact / evidence:** The three intended test commands exited before running tests.
- **Correction / remaining risk:** Reran each test from its workspace directory with workspace-relative paths. All targeted suites passed. None.
