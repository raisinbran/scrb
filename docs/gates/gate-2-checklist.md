# Gate 2 Checklist

Status: **open**, from the repository on 2026-10-31. This replaces older Gate 2 lists until the evidence note `gate-2.md` is written. Results not yet on `main` are on `windows-restart-test`.

Gate 2 text: `dev-plan/Meeting Scribe - Development Plan (v2.0).md`. Clause-to-test map: `docs/plans/capture-contract-and-clock.md`. A new requirement joins this list only if it covers shown recording reliability, data loss, or a Gate 2 criterion.

## Evidence

| Clause                                                                     | Mac                                                                           | Windows                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 4-hour run with pauses, a device change and a crash (T15)                  | Done, 2026-10-31                                                              | Done, 2026-10-30                                                                    |
| Loss under load: 15 s per track at most, no gap over 5 s, every gap marked | Accepted, 2026-10-31: 12.2 s and 8.9 s lost, every gap marked. See decision 4 | **Failed on the headset:** 309.9 s. Rerun on the built-in mic                       |
| Real call, drift from a shared sound (T18)                                 | Accepted, 2 h 29 min, 0 ms drift. See decision 1                              | Whole-computer capture passes. **Drift on the followed Teams path is not measured** |
| Audio-service restart (T17)                                                | Done, 2026-11-01                                                              | Done                                                                                |
| Stopped stream and privacy (T6, T20)                                       | T6 done, 2026-10-31. **T20 failed on the mic: 50 s of silence with no warning.** Meeting track not tested          | Done                                                                                |

## To do

**Windows**

- [ ] Merge the BUG-1 fix from `windows-restart-test`
- [ ] Fix BUG-2: mark the gap before a track's first chunk
- [ ] Try Teams from the real app's picker
- [ ] Measure drift on a followed Teams call
- [ ] Run the 4-hour load run on the built-in mic, with the silence check, overnight

**Mac**

- [x] Merge `mac-gate2-runs`
- [x] Add the same CPU load to `long_run_app.mjs`: half the logical cores, below-normal priority
- [x] Run the 4-hour load run overnight. Accepted, see decision 4
- [x] Run T17, owner present
- [x] Run T6 on the real helper, with a forced stream stop
- [ ] Fix T20: warn and mark the gap when a reopen hits denied access, and show `permissionLost` in the app (also missing for Windows)
- [ ] Rerun T20 on both switches, with the reopen tied to the switch change
- [ ] Run the USB mic case at 44.1 kHz with real speech, from Monday evening, 2026-11-02

**Both**

- [ ] After the last capture change, run `npm run check`, `npm run test:smoke` and the native builds
- [ ] Write `gate-2.md` from this list for owner approval

## Owner decisions

1. **The Mac 2 h 29 min call counts as T18 (accepted, 2026-10-31).** It used real call audio as the shared sound, not a click train, and shows no gaps or restarts. Its 49 usable windows cover about minutes 30 to 140, with a 17 ms spread. The target allows about 23 ms in that span, so drift passes for that span. The first 30 minutes are unmeasured and the recording is deleted, so this cannot be rechecked.
2. **The `coreaudiod` restart may run for T17 (approved, 2026-10-31).** This settles decision M3 in `macos-capture-adapter.md`. It stops all Mac audio for a moment, so the owner runs it, types the password, and picks a time when nothing else is playing.
3. **Still open: waive any of the list above?** Recommended: none. The Mac load run stays at 4 hours: it costs no owner time, gives the same evidence as Windows, and tests the code changed after the first Mac run.
4. **The Mac load run's 5.5 s gap is accepted (2026-11-01), with no rerun.** The owner was using the Mac during that minute and caused the lag by opening several apps. They closed them on noticing it. The run lost 12.2 s and 8.9 s against the 15 s limit, with every gap marked, and the stall does not count against the result.

## Not needed for Gate 2

- Full T19, moved to the 8-hour run before Gate 8 (owner decision, 2026-10-31). The Gate 2 CPU load does not stand in for it.
- 8-hour runs, before Gate 8.
- Zoom and browser targets, and a real output-device unplug. They stay open under BUG-1 for later.

## Cloud work while Gate 2 is open

Keep one cloud batch open at a time. The next starts only after the last passes QA. No batch touches capture code. Later-phase work stays off `main` until its gates pass.
