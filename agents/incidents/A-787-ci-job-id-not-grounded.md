### A-787 — 2026-11-18 — ChatGPT Chat / cloud — guessed CI job identifier instead of using returned job ID
- **What failed:** During PR #361 macOS CI evidence inspection, one read-only GitHub job-log request used an invented job ID, returned 404, and added an unnecessary call.
- **Impact:** No repository, PR, CI run, file, model or recording was modified. One avoidable read-only request and retry.
- **Agent-controlled cause:** Failed to reuse the exact job ID returned by the workflow-run jobs API.
- **Correction:** Read the job list for run #44413685086, used actual macOS job ID 135188225673, and verified the six About-model tests plus the full suite's passing summary.
- **Remaining risk:** No known technical risk; quota cost is unavailable on this ChatGPT Chat surface.
