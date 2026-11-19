### A-799 — 2026-11-18 — CI diagnostic query combined incompatible selectors

- **Status / attribution:** Confirmed agent error; no repository or CI state changed.
- **What failed:** A read-only diagnostics request supplied a check-run ID, workflow-run ID and job ID together, although the tool accepts one selector per detail request.
- **Impact:** That one lookup returned a parameter-selection error. The correct bounded query immediately afterward retrieved the Windows failure.
- **Correction / remaining risk:** Used separate requests keyed by check run, workflow run and job. Low.
