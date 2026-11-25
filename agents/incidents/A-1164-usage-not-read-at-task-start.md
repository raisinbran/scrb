### A-1164 — 2026-11-25 — Mac — Usage meters not read at task start (Stage 2)

- **Agent:** Claude (Sonnet 5.5, Mac)
- **Attribution:** Confirmed self-induced. I did not call `get_usage` at the start of the Gate 5 Stage 2 task, only at the end, against the measure-at-start-and-end rule.
- **Evidence:** the usage row `agents/usage-log/2026-11-25-vocab-gate5-stage2.md` records the start as unavailable (not read). The task also needed a retry loop (about 12 runs of `scripts/dev-assets.sh ami-series`) because the AMI mirror returned 503; that was an external outage, not counted as a mistake.
- **Impact:** no per-task usage change can be computed; account-wide readings are shared with other sessions anyway.
- **Correction:** end readings recorded; remaining risk low.
