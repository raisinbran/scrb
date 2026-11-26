### A-1166 — 2026-11-25 — Mac — N1 usage row copied from a per-file row; one malformed shell command

- **Agent:** Claude (Sonnet 5.5)
- **Attribution:** Confirmed self-induced. The first draft of `agents/usage-log/2026-11-25-n1-agenda-pilot.md` copied the newest per-file row's layout (not the legacy header) and repeated A-1165: "used" percentages, UTC reset times and no decrease column. Separately, a test-fix command used GNU `sed -i` syntax on macOS and wrote stray files (`/tmp/x`, a temporary report test at the repo root); the file was removed before commit and the test fixed with an edit.
- **Evidence:** The row was caught by reading A-1165 after the PR was opened and rewritten in a follow-up commit; the sed error appeared in the command output.
- **Impact:** One extra commit; no data lost.
- **Correction:** Row rewritten to the header's columns; stray files removed.
- **Remaining risk:** Low; copy the column order from the legacy header, as A-1165 already says.
