### A-356 — 2026-11-13 — Windows PC — omitted per-command safe-directory override

- **Status / attribution:** Confirmed agent command error; no repository or global Git configuration changed.
- **What failed:** After Git reported the checkout's owner SID differed from the current user, I added `-c safe.directory=...` to the status command but omitted it from subsequent read-only `git log` and `git remote` commands. Those commands repeated Git's exact `fatal: detected dubious ownership in repository at 'C:/Users/brand/Documents/scrb-check/scrb'` message and its suggestion to add the path globally.
- **Impact:** Those two metadata reads failed; no files or settings were changed.
- **Correction / remaining risk:** Continued using the per-command `-c safe.directory=C:/Users/brand/Documents/scrb-check/scrb` override. Low.