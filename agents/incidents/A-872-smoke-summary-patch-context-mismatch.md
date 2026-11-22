### A-872 — 2026-11-19 — W10 — smoke summary patch used stale context

- **Status / attribution:** Confirmed editing error while adding the machine-readable host checkpoint fields; no files were changed by the failed patch.
- **What failed:** The patch anchor expected a summary-field position that differed from the current script, so the patch tool rejected the entire change.
- **Impact:** One failed patch attempt; no source or test state changed.
- **Correction / remaining risk:** Read the exact bounded context and applied the fields against the current summary structure. Low.
- **Publication:** Local and unpublished in `agents/incidents/`; included in the W10 installer-smoke reporting PR branch.

