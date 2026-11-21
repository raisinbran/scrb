### A-947 — 2026-11-20 — W10 — npm cache inspection was denied

- **Status / attribution:** Confirmed agent diagnostic attempt error; no repository or cache data was modified.
- **What failed:** A narrow npm cache listing tried to read the owner's cache directory, which the restricted account cannot enumerate (EPERM).
- **Impact:** The optional local formatter-cache check did not run; no package install or test was attempted.
- **Correction / remaining risk:** Check the already-known original checkout's formatter executable directly and use it only to format the target file in this worktree. Low.

