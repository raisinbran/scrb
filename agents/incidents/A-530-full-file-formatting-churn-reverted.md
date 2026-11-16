### A-530 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — whole-file formatting changed unrelated verifier lines

- **Status / attribution:** Confirmed agent editing error; the behavioral change remained within scope.
- **What failed:** I ran the repository formatter over the complete verifier and regression file. Its output reformatted unrelated existing code in both files, expanding the diff beyond the requested fix.
- **Impact:** The pending worktree diff contained unrelated formatting changes. No commit or PR was created, and the original Gate 8 report, real recordings, primary checkout, and recovery stash were untouched.
- **Correction / remaining risk:** Restore only those two files to the current-main baseline, reapply the focused change and regression cases without whole-file formatting, then rerun the focused suite. Low.
