### A-795 — 2026-11-18 — initial copy into managed worktree was denied

- **Status / attribution:** Confirmed agent error; no source loss.
- **What failed:** The initial copy of the already-verified pinned Opus inputs into the managed worktree was blocked by the filesystem sandbox. The PowerShell command did not stop on the copy error and printed repeated failures.
- **Impact:** The intended inputs were not copied by that attempt; the repeated output made the failure less clear. Source and destination remained intact.
- **Correction / remaining risk:** Re-ran the bounded copy with stop-on-error and required escalation; verified the copied source revision and library hash. Low.
