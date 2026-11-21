### A-979 — 2026-11-20 — ChatGPT Chat — Open-PR incident scan exceeded connector batch limit

- **Status / attribution:** Confirmed self-induced tool batching error during PR #350 incident-ID reconciliation, cloud read-only phase.
- **What failed:** An attempt to inspect too many open pull-request file lists in one connector orchestration hit `Code Mode exceeded the maximum number of tool calls`. The attempted batch did not complete and its partial results were not used to assert absence of collisions.
- **Impact:** One unsuccessful audit batch and avoidable review time; no repository edit, device action, or private-data access. Usage cost is not separately measurable.
- **Correction / remaining risk:** Split the open-PR inventory into bounded smaller batches, inspect existing reservations against current `main` and open PRs, and preserve original incident IDs unless a real collision is demonstrated. Unpublished local reservations cannot be excluded by cloud GitHub alone.
