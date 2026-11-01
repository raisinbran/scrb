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
- **Fix:** `docs/plans/teams-desktop-capture.md`, awaiting owner approval.

To do:

- [ ] Owner approves the plan
- [ ] Build the Teams output-device source
- [ ] Build the silence check for all per-app targets
- [ ] Measure capture with output muted (F4)
- [ ] Rerun T18 on a real Teams call, picked as Teams
- [ ] Test Zoom and browser targets
- [ ] Update the User Manual with the final behavior

## Closed

None yet.
