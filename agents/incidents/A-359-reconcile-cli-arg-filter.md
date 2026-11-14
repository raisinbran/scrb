### A-359 — 2026-11-14 — Claude Code (Sonnet 5.5) / Mac desktop — evaluation helper dropped its first argument; shell loops passed one meeting name

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** In the new `eval/reconcile.ts` the argument filter skipped index `at + 1` even when `--per-minute` was absent (`at` = -1), so the first path argument was dropped and `--no-cap` runs failed. Separately, I passed the meeting list to the helper scripts as one quoted zsh string, so those runs failed to find a file named `ES2016b ES2008b IS1009d`. The first background narrative re-record also exited silently without writing a result and had to be run again in the foreground.
- **Impact:** Four failed helper runs and one repeat; no scored number came from a failed run. About 10 minutes.
- **Correction / remaining risk:** Filter fixed before any reported number; every figure in the results section was produced after the fix. None.
