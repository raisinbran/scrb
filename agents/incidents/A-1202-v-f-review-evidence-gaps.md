### A-1202 — 2026-11-26 — V-f replay evidence and fixture validation gaps

- **Agent:** Codex Desktop (gpt-6.2-sol, low) / Mac.
- **What happened:** The initial driver omitted per-run provenance, failed-run receipts, and the second annotation eligibility floor. It accepted nonfinite annotation values through coercion. After the prepublication reservation scan, a separate PR also used A-1196.
- **Impact and evidence:** The independent review on PR #523 rejected evidence completeness and fixture enforcement. The seven historical invocations cannot be independently matched to identical input bytes. The historical incident number conflicted with PR #520.
- **Correction:** Publish retained batch and outcome hashes, label historical per-run provenance unverified, require validated inputs and eligibility for future runs, add model-free tests, and renumber the historical incident to A-1201.
- **Remaining risk:** The historical failure cause remains unclassified, confirmation remains unrun, and independent review of the corrections is pending.
