### A-1132 — 2026-11-24 — Claude Code — M1.5 B0 prep: minor tool and drafting errors

- **Agent:** Claude (Claude Code, Sonnet 5.5, Mac desktop app)
- **Status:** confirmed; corrected in the same session.
- **What happened:** (1) read the M1.4 evidence file from the new worktree's path, where it does not exist (it lives on the unmerged M1.4 branch); (2) one shell call was issued after the working directory changed and needed a re-review before it ran; (3) the first draft of the run sheet's beep-routing bullet was self-contradictory ("not possible with one file") and was rewritten before commit.
- **Impact:** a few extra commands; no data or owner time lost, nothing played or installed.
- **Correction / remaining risk:** read cross-branch evidence with `git show origin/<branch>:<path>`; start shell calls with an explicit `cd`. Run sheet is unexecuted, so its Darwin 27 mute assumption is still unproven until the preflight.
