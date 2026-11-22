### A-1044 — 2026-11-21 — Cloud coordinator — Unsupported workflow metadata endpoints
- **Observed failure:** Two read-only requests to the GitHub workflow metadata/run endpoints returned HTTP 400 (connector URL not allowed).
- **Cause:** Assumed the connection's generic fetch action supported the workflow-specific REST URL family.
- **Effect:** Two rejected reads; no dispatch, Git modification, CI change, data exposure, or owner-device action.
- **Correction/evidence:** Read the default-branch workflow with the supported repository file API and used the supported repository-wide Actions run collection filtered by `workflow_dispatch` (zero runs).
- **Remaining risk:** No producer/consumer runtime evidence yet; this tooling failure is not a product defect.
