# Owner decisions after the contract fixes (2026-10-30)

All accepted by the owner on 2026-10-30.

1. `packages/contracts` is approved. Still to add with the capture work: a mic test and meters before Start.
2. Live delay: keep 5 s chunks for saved audio and send a separate live feed to the transcriber.
3. Auto-name line: 0.60. Below it the app suggests a name.
4. A recording that starts during an import stops the import, and the user retries it.
5. Final DER: keep the ~25% target. Check the ~8.5% hold-out result at the diarization gate.
6. Planner is replaced by written plans the owner approves (Development Process, "Risky-change plans").

## Capture and chunk plans

Every recommendation in `docs/plans/` is accepted, including the proposed contract additions, which are applied in the phase that needs them. Exceptions and notes:

- Mac signing: one stable self-signed certificate. Avoid the recurring $99 Apple Developer ID unless the app cannot work without it; if the upgrade test fails, look for a workaround first.
- Test hardware: the USB mic exists but is not available until Monday evening (2026-11-02). Run the USB case then.
- Gate 2 mic loss limit: at most 30 s per track over 8 hours, no single gap over 5 s, every gap marked.
- Crash loss: about 1 s for a program crash, about 5 s for a power cut, always marked.
- Whole-computer audio is never switched on automatically: warn and offer one click.

## Long-run tests

Most meetings run 0.5 to 2 hours and rarely over 4. Routine long runs are 4 hours, at Gates 2 and 3 and before maintenance releases. One 8-hour run per machine stays, before Gate 8. The drift target is under 50 ms over 4 hours. The app still supports 8 hours. Where the plans in `docs/plans/` say 8 hours for T15 or Gate 2, read 4 hours. The Gate 2 mic-loss limit scales the same way: at most 15 s per track over 4 hours, no single gap over 5 s, every gap marked.

## Still needed

- QA, then owner approval, of `docs/plans/pause-resume.md`.
- Written plans for corrections, index upgrades and delete.
- The summary-to-export adapter is on `backend-export-adapter`. Its open gaps are in `2026-10-30-export-summary-gaps.md`.

## Commit history

On 2026-10-30 the owner had attribution trailers removed from all commits. That changed every commit ID, so IDs quoted in older notes and plans no longer exist. Find the commit by date and message.
