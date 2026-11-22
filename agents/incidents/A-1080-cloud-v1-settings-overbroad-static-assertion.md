### A-1080 — 2026-11-22 — V1 Settings transformation verification overmatched a legitimate summary route

- **Attribution:** Self-induced cloud authoring/verification assertion mistake, not an application, GitHub CI or model-download failure.
- **Observed:** A local, pre-publication static assertion rejected a candidate transformation because it looked for the string `ModelUpdate` anywhere in ModelsSection. The legitimate packaged summary download still uses `installModelUpdate({ role: 'summary' })`, so the assertion falsely classified the valid retained code path as an unwanted general-update flow.
- **Impact:** One unsuccessful **read-only** transformation check. It failed before any branch or GitHub file mutation. No local tests, installer run, device, model or owner data were accessed.
- **Correction:** Scoped the assertion to actual mock-only calls `checkModelUpdates` and `revertModel` and the obsolete general update state/import; separately required preservation of `installModelUpdate({ role: 'summary' })` and `startModelDownload`. Reconstructed the edits from the unchanged source; no code was committed from the failed check.
- **Prevention:** Distinguish shared contract call names with valid role-specific consumers from simulated UI flows; use exact call/AST-level conditions rather than broad substring matching.
- **Publication reservation:** Public main and visible PR inventories must be rechecked at merge; unpublished host-local reservations cannot be asserted unique.
