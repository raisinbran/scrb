### A-1064 — 2026-11-22 — cloud PR #424 correction — overbroad source-preparation assertion

- **Observed error:** One pre-commit source-preparation call aborted with `Error: Old substring logic remains` after the old `$profileArg` declaration had been removed.
- **Cause:** The author's guard searched for the prefix `$profileArg`, unintentionally matching the newly introduced variable `$profileArgument`. The guard was broader than the prohibited expression.
- **Effect:** One avoidable failed source-preparation invocation; no Git commit/ref update, CI run, installer launch, or owner-device action resulted from the failed call.
- **Correction:** Scoped the guard to the obsolete `$profileArg =` assignment and `$normalizedCommand`, then created the intended candidate blob. No passing automated test was rerun because of this error.
- **Remaining risk:** Independent review and exact-head CI still required; no actual installed-app startup has been attempted.
