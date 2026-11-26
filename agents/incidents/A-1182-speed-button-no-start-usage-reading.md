### A-1182 — 2026-11-25 — Mac — Usage meters not read at task start again (PR B, speed button)

- **Agent:** Claude (Sonnet 5.5, Mac worktree session)
- **Attribution:** Confirmed self-induced. I did not call get_usage before starting PR B, repeating A-1181 from PR A in the same session.
- **Evidence:** `agents/usage-log/2026-11-25-playback-rate-pr-b.md` records the start readings as unavailable.
- **Impact:** No start-to-end usage change can be computed for this task.
- **Correction:** Incident filed; read get_usage before the first tool call of every task.
- **Remaining risk:** Low. Identifier checked against origin/main and all open PRs (A-1181 highest).
