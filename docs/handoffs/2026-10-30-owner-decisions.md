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

## Still needed

- Written plans for pause/resume, corrections, index upgrades and delete.
- The summary-to-export adapter is on `backend-export-adapter`. Its open gaps are in `2026-10-30-export-summary-gaps.md`.
