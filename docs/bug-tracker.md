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
- **Fix:** `docs/plans/teams-desktop-capture.md`, approved 2026-10-31. Merged in PR #10. Heard a real Teams call on 2026-10-31.
- **Close when:** the items below are done.

To do:

- [x] Owner approves the plan
- [x] Build the Teams output-device source
- [x] Build the silence check for all per-app targets
- [x] Measure capture with output muted (F4): still records, -14.4 dB
- [ ] Test a real second output device and a real unplug (F1 to F3)
- [x] Rerun the 4 h load run with the silence check (F11): no false warning in 4 h, on a tone target with one hibernate
- [x] Rerun T18 on a real Teams call, helper following Teams: meeting track -8 dB, no false warning
- [x] Measure drift on a followed call: 40 of 45 windows, 82 then 81 ms, drift -1 ms (`t18-picker.txt`)
- [x] Try Teams from the real app's picker: 22-minute recording, Teams heard, followed
- [ ] Test Zoom and browser targets
- [ ] Update the User Manual with the final behavior

## Closed

### BUG-2: A mic that fails at Start leaves its first seconds unmarked

- **Priority:** Medium. Requirement: no audio lost silently.
- **Opened:** 2026-10-31
- **Affects:** Windows, when the mic cannot open at Start and a later retry succeeds.
- **Effect:** in the `t18-follow` run the mic's first chunk began at 4.6 s with `missingBeforeMs` 0 and no gap in the verifier. The chunk's start time is right, but nothing marks the gap. Whether the app shows it was not checked.
- **Found by:** a bad mic ID from a script mistake, not a real device fault.
- **Fix:** `docs/plans/first-chunk-gap.md`, approved 2026-11-01. Merged in PR #10.
- **Closed:** 2026-11-01

To do:

- [x] Mark the gap before a mic track's first chunk: real bad-mic run shows a 6.2 s `audioMissing` span
- [x] Check the same path on the meeting track: same code; pipeline and sealing tests
