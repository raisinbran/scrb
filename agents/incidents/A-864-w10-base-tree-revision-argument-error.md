### A-864 — 2026-11-19 — W10 — first Git base-tree lookup used a shell-sensitive revision expression

- **Status / attribution:** Confirmed command-construction error during accounting-PR preparation; no repository state changed.
- **What failed:** The first `git rev-parse <commit>^{tree}` invocation produced conflicting output and an invalid follow-on argument in the PowerShell command wrapper, so that result was not used.
- **Impact:** One failed base-tree lookup and extra diagnostic call; no commit, branch update, CI run, installation, or recording resulted.
- **Correction / remaining risk:** Replaced the shell-sensitive expression with `git show -s --format=%T <commit>` and confirmed the exact base commit's tree SHA. Low.
- **Publication:** This incident and its task row are included in the separate W10 accounting draft PR branch; not on `main` pending exact-head CI and independent review.
