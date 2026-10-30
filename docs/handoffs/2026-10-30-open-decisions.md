# Open decisions after the contract fixes (2026-10-30)

From the transcription session's report and the contract review.

## Owner decisions

1. Approve `packages/contracts` (decisions listed in its README).
2. Live delay misses the 3 s target with 5 s chunks: shorter chunks, a separate live feed, or a relaxed target.
3. Auto-name line: 0.60 is the safe end of the measured 0.55-0.60 band. Confirm it.
4. A recording starting during an import stops the import and the user retries it. Confirm, or require pausing instead.
5. Final DER: met on some meetings, but the tuning-set result is still 15-22% and hold-out results are unverified. Decide what evidence closes this.

## Plans

- Planner was waived by the owner for the contract fixes (`e49a022`): IPC validation and summary format v3.
- Chunk format and manifest (`chunks.json`, `transcript.final.json`) still need a plan, as do the skipped plans for corrections, index upgrades, delete and capture. `planner` is not installed on the Mac.

## Not yet built

- Mock corrections, speaker changes and summary edits do not change data (QA-05).
- `packages/export` has no adapter from the summary file. `impactInferred`, `criticalDecisions` and `projectDevelopments` have no source yet.
