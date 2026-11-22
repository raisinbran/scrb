### A-1087 — 2026-11-22 — M5 PR #439 usage-row update — rejected connector argument

- **What failed:** A GitHub contents update for the task usage row was submitted with the field name `content_sha`; the connected API requires `sha`. The connector rejected the call during schema validation.
- **Attribution / impact:** Confirmed authoring/tool-call error. The request was rejected before any GitHub mutation, so no repository data changed and no owner data was accessed.
- **Correction:** Read the update-file schema and prepared a sequential retry using the current blob SHA under the required `sha` field.
- **Remaining risk:** The usage-row correction and this incident record still need publication validation and exact-head checks.