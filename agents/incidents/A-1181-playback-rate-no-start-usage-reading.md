### A-1181 — 2026-11-25 — Mac — Usage meters not read at task start (PR A, playback rate)

- **Agent:** Claude (Sonnet 5.5, Mac worktree session)
- **Attribution:** Confirmed self-induced. I did not call get_usage before starting; the usage row records the start readings as unavailable although the tool was available.
- **Evidence:** `agents/usage-log/2026-11-25-playback-rate-pr-a.md` shows "unavailable (not read at start)"; the PR body first said "No incidents". Same pattern as A-723.
- **Impact:** No start-to-end usage change can be computed for this task; one review round.
- **Correction:** Incident filed and PR body corrected; read get_usage first on every task.
- **Remaining risk:** Low. Identifier checked against origin/main and open PRs #509 to #512 (A-1175 to A-1180 in use).
