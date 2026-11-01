# Bug tracker

Open bugs, highest priority first.

## Open

### BUG-1: Teams desktop records a silent meeting track on Windows

- **Priority:** High. Major bug (owner decision, 2026-10-31).
- **Opened:** 2026-10-31
- **Affects:** new Teams desktop app (`ms-teams.exe`) on Windows, when picked as the meeting app. Classic Teams was not tested.
- **Effect:** the other people in the meeting are missing from the recording, and the app gives no warning.
- **Cause:** per-app capture cannot hear call-type (Communications) streams. OBS uses the same route. That Teams uses this stream type is inferred from an identical result, not read directly. One PC tested. See `native/windows-capture/README.md`, findings 16 and 17.
- **Workaround:** pick Whole computer audio. See `docs/user-manual/known-issues.md`.
- **Fix:** `docs/plans/teams-desktop-capture.md`, approved 2026-10-31. Built on `windows-restart-test`, not merged, not yet run on a real call.

To do:

- [x] Owner approves the plan
- [x] Build the Teams output-device source
- [x] Build the silence check for all per-app targets
- [x] Measure capture with output muted (F4): still records, -14.4 dB
- [ ] Test a real second output device and a real unplug (F1 to F3)
- [ ] Rerun the 4 h load run with the silence check (F11)
- [ ] Rerun T18 on a real Teams call, picked as Teams
- [ ] Test Zoom and browser targets
- [ ] Update the User Manual with the final behavior

## Closed

None yet.
