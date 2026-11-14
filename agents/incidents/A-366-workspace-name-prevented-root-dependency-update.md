### A-366 — 2026-11-14 — Codex / Mac desktop — npm command used a non-workspace root name
- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** An npm install invocation used `--workspace=meeting-scribe`, but `meeting-scribe` is the root project and not an npm workspace. npm stopped with “No workspaces found” before changing the dependency.
- **Impact:** The chained command did not reach the requested `typescript-eslint` or `@vitejs/plugin-react` lock updates. Earlier export and transcription updates completed.
- **Correction / remaining risk:** Reran the remaining updates using the correct root install form. No product files were changed by the failed invocation. Low.
