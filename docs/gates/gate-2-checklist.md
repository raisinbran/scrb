# Gate 2 Checklist

Status: **open**, updated 2026-11-01. See draft `docs/gates/gate-2.md` for final evidence review; owner approval is pending. Windows capture changes were merged in PR #10.

Gate 2 text: `dev-plan/Meeting Scribe - Development Plan (v2.0).md`. Clause-to-test map: `docs/plans/capture-contract-and-clock.md`. A new requirement joins this list only if it covers shown recording reliability, data loss, or a Gate 2 criterion.

## Evidence

| Clause                                                                     | Mac                                                                           | Windows                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 4-hour run with pauses, a device change and a crash (T15)                  | Done, 2026-10-31                                                              | Done, 2026-10-30                                                                    |
| Loss under load: 15 s per track at most, no gap over 5 s, every gap marked | Accepted: 12.18 s mic / 8.90 s meeting; 5.52 s gap excepted by owner (decision 4) | Combined 4 h runs accepted: built-in mic 1.221 s and meeting 0.331 s loss excluding owner-excepted hibernation; Bluetooth headset failed at 309.9 s |
| Real call, drift from a shared sound (T18)                                 | Accepted, 2 h 29 min, 0 ms drift. See decision 1                              | Whole-computer −3 ms documented; followed Teams −1 ms reported, but the committed `t18-picker.txt` lacks successful measurement output |
| Audio-service restart (T17)                                                | Done, 2026-11-01                                                              | Done                                                                                |
| Stopped stream and privacy (T6, T20)                                       | T6 done, 2026-10-31. T20 done, 2026-11-01                                     | Done                                                                                |

## To do

**Windows**

- [x] Merge the BUG-1 fix from `windows-restart-test`
- [x] Fix BUG-2: mark the gap before a track's first chunk
- [x] Try Teams from the real app's picker
- [x] Measure drift on a followed Teams call: drift -1 ms, 40 of 45 windows (`t18-picker.txt`)
- [x] Run the 4-hour load run on the built-in mic, with the silence check: 1.221 s mic loss, with the owner's exception for one 18.8 min hibernate on critical battery (`long-run-builtin.txt`). It counts with the 10-30 run (owner decision, 2026-11-01)

**Mac**

- [x] Merge `mac-gate2-runs`
- [x] Add the same CPU load to `long_run_app.mjs`: half the logical cores, below-normal priority
- [x] Run the 4-hour load run overnight. Accepted, see decision 4
- [x] Run T17, owner present
- [x] Run T6 on the real helper, with a forced stream stop
- [x] Fix T20: warn and mark the gap when a reopen hits denied access, and show `permissionLost` in the app (also missing for Windows)
- [x] Rerun T20 on both switches, with the reopen tied to the switch change

**Both**

- [x] GitHub CI on final `main` baseline `e180a51`: Windows and macOS jobs passed (typecheck, lint, unit tests, boundaries, build and smoke); [run 41293637940](https://github.com/raisinbran/scrb/actions/runs/41293637940). The CI runs the constituent `npm run check` commands, not `npm run check` itself.
- [ ] Verify current-baseline native capture builds and any remaining short, hardware-dependent smoke checks on both computers; record results without repeating endurance runs
- [ ] Reconcile T18 picker drift evidence: recover the original successful output, or record an explicit owner disposition of the missing raw measurement log
- [ ] Independently QA and obtain owner approval of draft `gate-2.md`

## Owner decisions

1. **The Mac 2 h 29 min call counts as T18 (accepted, 2026-10-31).** It used real call audio as the shared sound, not a click train, and shows no gaps or restarts. Its 49 usable windows cover about minutes 30 to 140, with a 17 ms spread. The target allows about 23 ms in that span, so drift passes for that span. The first 30 minutes are unmeasured and the recording is deleted, so this cannot be rechecked.
2. **The `coreaudiod` restart may run for T17 (approved, 2026-10-31).** This settles decision M3 in `macos-capture-adapter.md`. It stops all Mac audio for a moment, so the owner runs it, types the password, and picks a time when nothing else is playing.
3. **Still open: waive any of the remaining Gate 2 tasks?** Recommended: none. The Mac load run stays at 4 hours: it costs no owner time, gives the same evidence as Windows, and tests the code changed after the first Mac run.
4. **The Mac load run's 5.5 s gap is accepted (2026-11-01), with no rerun.** The owner was using the Mac during that minute and caused the lag by opening several apps. They closed them on noticing it. The run lost 12.2 s and 8.9 s against the 15 s limit, with every gap marked, and the stall does not count against the result.

## Not needed for Gate 2

- Mac USB microphone speech capture at 44.1 kHz is deferred to Phase 8 (before Gate 8), not waived. USB mic use is primarily on Windows; the Mac test is a release compatibility check (owner decision, 2026-11-01).
- Full T19, moved to the 8-hour run before Gate 8 (owner decision, 2026-10-31). The Gate 2 CPU load does not stand in for it.
- 8-hour runs, before Gate 8.
- Zoom and browser targets, and a real output-device unplug. They stay open under BUG-1 for later.

## Cloud work while Gate 2 is open

Keep one cloud batch open at a time. The next starts only after the last passes QA. No batch touches capture code. Later-phase work stays off `main` until its gates pass.
