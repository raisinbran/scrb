### A-872 — 2026-11-19 — Mac A2 packaging command exit status and raw log not preserved

- **Status / attribution:** Confirmed reporting/evidence-capture omission; no application or installation impact.
- **What failed:** The packaging command emitted its final “Built and verified” line, but the terminal session ended before its process exit code was captured. The full raw build output was not redirected to a durable log.
- **Impact:** The process exit status is unavailable, and only the observed diagnostic summary and final artifact evidence were preserved.
- **Correction / remaining risk:** No automatic rebuild was run. The candidate was independently checked for source identity, hashes, architectures, dependency closure, licenses, FFmpeg policy and deep signature. A local evidence note records the final results and the warnings that appeared. Low; raw build diagnostics cannot be reconstructed.
