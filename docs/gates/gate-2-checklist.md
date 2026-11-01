# Gate 2 Checklist

Status: **open**, updated 2026-11-01. See draft `docs/gates/gate-2.md` for final evidence review; owner approval is pending. Windows capture changes were merged in PR #10.

Gate 2 text: `dev-plan/Meeting Scribe - Development Plan (v2.0).md`. Clause-to-test map: `docs/plans/capture-contract-and-clock.md`. A new requirement joins this list only if it covers shown recording reliability, data loss, or a Gate 2 criterion.

## Evidence

| Clause                                                                     | Mac                                                                           | Windows                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 4-hour run with pauses, a device change and a crash (T15)                  | Done, 2026-10-31                                                              | Done, 2026-10-30                                                                    |
| Loss under load: 15 s per track at most, no gap over 5 s, every gap marked | Accepted: 12.18 s mic / 8.90 s meeting; 5.52 s gap excepted by owner (decision 4) | Combined 4 h runs accepted: built-in mic 1.221 s and meeting 0.331 s loss excluding owner-excepted hibernation; Bluetooth headset failed at 309.9 s |
| Real call, drift from a shared sound (T18)                                 | Accepted, 2 h 29 min, 0 ms drift. See decision 1                              | Whole-computer −3 ms; original followed-Teams picker recording remeasured with existing script: 40/45 windows, −1 ms drift ([PR #14](https://github.com/raisinbran/scrb/pull/14)); failed first invocation preserved |
| Audio-service restart (T17)                                                | Done, 2026-11-01                                                              | Done                                                                                |
| Stopped stream and privacy (T6, T20)                                       | T6 done, 2026-10-31. T20 done, 2026-11-01                                     | Done                                                                                |

## To do

**Windows**

- [x] Merge the BUG-1 fix from `windows-restart-test`
- [x] Fix BUG-2: mark the gap before a track's first chunk
- [x] Try Teams from the real app's picker
- [x] Recovered T18 measurement: original Teams-picker recording, 40/45 windows, −1 ms drift; successful output in [PR #14](https://github.com/raisinbran/scrb/pull/14). Original `t18-picker.txt` command failed; it is not the successful measurement.
- [x] Run the 4-hour load run on the built-in mic, with the silence check: 1.221 s mic loss, with the owner's exception for one 18.8 min hibernate on critical battery (`long-run-builtin.txt`). It counts with the 10-30 run (owner decision, 2026-11-01)

**Mac**

- [x] Merge `mac-gate2-runs`
- [x] Add the same CPU load to `long_run_app.mjs`: half the logical cores, below-normal priority
- [x] Run the 4-hour load run overnight. Accepted, see decision 4
- [x] Run T17, owner present
- [x] Run T6 on the real helper, with a forced stream stop
- [x] Fix T20: warn and mark the gap when a reopen hits denied access, and show `permissionLost` in the app (also missing for Windows)
- [x] Rerun T20 on both switches, with the reopen tied to the switch change
- [x] Final macOS native verification on `e180a51`: helper build PASS, six-rate software resampler regression PASS, three-round stop-during-pause smoke PASS; existing T6/T17/T20 hardware logs reused, not repeated ([PR #13](https://github.com/raisinbran/scrb/pull/13)).

**Both**

- [x] GitHub CI on final `main` baseline `e180a51`: Windows and macOS jobs passed (typecheck, lint, unit tests, boundaries, build and smoke); [run 41293637940](https://github.com/raisinbran/scrb/actions/runs/41293637940). The CI runs the constituent `npm run check` commands, not `npm run check` itself.
- [x] Windows native helper build and scoped desktop hardware smoke on `e180a51` PASS (pause/marker, follow/silence, restart, crash, BUG-2); source results in [PR #14](https://github.com/raisinbran/scrb/pull/14). Original F11 replay failed and is tracked separately below.
- [x] Windows followed-Teams T18 recorded result independently remeasured on the **saved original** recording: 40/45 windows, −1 ms drift; not a new call. [Recovered output in PR #14](https://github.com/raisinbran/scrb/pull/14).
- [ ] **F11 integration:** On `main e180a51` the native CSV replay FAILS (41,030 ms vs 1,690 ms). [PR #15](https://github.com/raisinbran/scrb/pull/15) corrects only the synthetic replay fixture (PCM amplitude 1 → 100, retained frame assertion). The initial corrected native run **PASS** and a **fresh full Windows native rebuild plus complete PipelineTests** on tested revision `99ce280` **PASS** (exit 0, zero failures, expected/detected 1,690/1,690 ms); [fresh log](https://github.com/raisinbran/scrb/blob/rosmont/f11-standby-replay-fix-20261101/native/windows-capture/results/f11-qa-pipeline-20261101.txt). Latest-head PR #15 cross-platform CI **PASS** ([run 41298097677](https://github.com/raisinbran/scrb/actions/runs/41298097677)); owner-authorized integration remains pending. Do not mark final native replay passed on `main` until then.
- [ ] Independent QA of consolidated draft [PR #12](https://github.com/raisinbran/scrb/pull/12) and explicit owner approval of `gate-2.md`. Duplicate checklist edits have been removed from PR #13/#14; their original native evidence is preserved there, and PR #12 owns the consolidated checklist.

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
