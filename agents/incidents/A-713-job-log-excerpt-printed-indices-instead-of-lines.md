### A-713 — 2026-11-16 — Cloud GitHub diagnostics — CI log excerpt printed indices rather than text

- **Severity/status/attribution:** Low; confirmed self-induced inspection-script display mistake, not a repository or runner failure.
- **Observed failure:** An initial connector log excerpt formatter mapped selected indices to the indices themselves instead of their source lines. The output was unusable for identifying the exact Prettier change, so a second targeted log fetch was necessary.
- **Impact:** One avoidable repeated connector read and diagnostic delay; no repository mutation, extra test run, local process or private data impact. Exact account usage cost unavailable.
- **Correction:** Print each selected line by its index with `lines[index]`, then inspect only the failing log range; the subsequent read exposed the exact multiline-destructuring diff.
- **Remaining risk:** None specific once corrected; future diagnostic scripts should validate their rendered output before taking action.
