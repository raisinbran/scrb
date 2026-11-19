### A-851 — 2026-11-18 — Overloaded Code Mode GitHub action batch

- **Status / attribution:** Confirmed coordinator-caused orchestration error during W2 post-W1/Mac integration, not an application or Git defect.
- **What happened:** Packed more GitHub connector calls into one Code Mode execution than its per-invocation limit. The call returned `Code Mode exceeded the maximum number of tool calls` **after** GitHub successfully created an unreferenced new tree `833c2ae2842931b333e3f0541a77a30dbfd0e0cc`.
- **Effect:** One rejected orchestration continuation; the tree object existed but no branch or PR ref was modified by the failed call. No CI retry or native-host execution resulted.
- **Correction:** Split subsequent GitHub operations into smaller invocations, created merge commit `7672cb305d6e0d46b55f929d78a9d0a2894f04fa` from the verified tree, compared its 16-file W2-only delta to main, and safely advanced the W2 ref with a non-forced, expected-head update. Then retargeted the PR to main and verified its CI started.
- **Publication:** Provisional coordination branch only, not main. Reconcile with all current published and unpublished reservations before merging; issue #358 remains open.
