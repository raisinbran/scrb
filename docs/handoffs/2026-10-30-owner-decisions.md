# Owner decisions after the contract fixes (2026-10-30)

All accepted by the owner on 2026-10-30.

1. `packages/contracts` is approved. Still to add with the capture work: a mic test and meters before Start.
2. Live delay: keep 5 s chunks for saved audio and send a separate live feed to the transcriber.
3. Auto-name line: 0.60. Below it the app suggests a name.
4. A recording that starts during an import stops the import, and the user retries it.
5. Final DER: keep the ~25% target. Check the ~8.5% hold-out result at the diarization gate.
6. Planner is replaced by written plans the owner approves (Development Process, "Risky-change plans").

## Still needed

- Written plans for the chunk format and manifest, corrections, index upgrades, delete and capture.
- Mock corrections, speaker changes and summary edits do not change data (QA-05).
- The summary-to-export adapter is on `backend-export-adapter`. Its open gaps are in `2026-10-30-export-summary-gaps.md`.
