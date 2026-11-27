### A-1204 — 2026-11-26 — Mac — Usage meters not read at task start (UI mocks refinement)

- **Agent:** Claude (Sonnet 5.5, Mac worktree session)
- **Attribution:** Confirmed self-induced. I did not call get_usage before my first tool call, repeating A-1181 and A-1182.
- **Evidence:** `agents/usage-log/2026-11-26-ui-mocks-refine.md` records the start readings as unavailable.
- **Impact:** No start-to-end usage change can be computed for this task.
- **Correction:** Incident filed; read get_usage before the first tool call of every task.
- **Remaining risk:** Low. Identifier checked against origin/main and all open PRs.
