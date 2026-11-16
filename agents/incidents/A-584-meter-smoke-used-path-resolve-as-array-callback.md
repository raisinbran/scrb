### A-584 — 2026-11-16 — Codex / Mac — meter smoke used `resolve` as an array callback

- **Status / attribution:** Confirmed harness error; the helper was not launched by this attempt.
- **What failed:** Mapping `path.resolve` directly over CLI arguments passed the index and argument array as extra path segments, causing `ERR_INVALID_ARG_TYPE`.
- **Impact:** The first meter-smoke invocation ended before opening capture.
- **Correction / remaining risk:** Wrapped `resolve` in a one-argument callback and recorded the corrected attempt separately. Low.
