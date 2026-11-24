### A-737 — 2026-11-17 — Codex / BCHEN-W10 — formatting check included unrelated existing files

- **What failed:** A Prettier check listed several whole, existing repository files and returned nonzero for their established formatting. The check was broader than the new/touched snippets and did not identify a new formatting defect by itself.
- **Impact:** An avoidable failed formatting command and noisy diagnostics; no broad formatting rewrite was applied.
- **Agent-controlled cause:** I used whole-file check scope on legacy files whose formatting state had not been established.
- **Correction / remaining risk:** I formatted only the newly created and small touched files, then ran focused lint, typechecks and tests. Existing formatting differences remain outside this change. Low.
