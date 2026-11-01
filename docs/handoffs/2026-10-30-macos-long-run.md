# Mac 4-hour run and the Stop-during-pause fix

**Run:** 2026-10-30, 11:50 to 15:50, real helper, tone plus default mic, 5 pauses of 30 s, helper built before the merge.

| Measure                             | Microphone                       | Meeting                          |
| ----------------------------------- | -------------------------------- | -------------------------------- |
| Chunks, numbered without a break    | 2850                             | 2850                             |
| Audio against timeline minus pauses | 14249.941 s of 14249.959 s       | 14249.931 s of 14249.940 s       |
| Gaps over 1 ms, all reasons         | 3, 62 ms in total, longest 23 ms | 2, 43 ms in total, longest 21 ms |
| Chunks crossing a pause             | 0                                | 0                                |

The two tracks' chunk starts stayed between -14.8 and +4.8 ms apart. Streams never stalled. No `.part` was left.

This measures track timelines, not a shared sound on both tracks. Output was muted, so pause test 13's drift figure with a shared sound still needs a run with audible playback.

**Fault found while reviewing the Windows helper:** Stop during a pause moved the gate's cutoff to the moment of Stop, so audio from the pause could pass. On the Mac, `stop_paused_case.py` found one chunk of paused audio in 8 rounds. `rt_gate_close` now moves only an open gate, and 40 rounds on both tracks pass.

**Device switches, 2026-10-30, hands-on with AirPods:** recording continued through connecting them, setting Input to the MacBook mic, and returning them to the case. The first run found a chunk at the wrong rate after a switch, because the writer read the rate from the ring and slots from the old device outlived the switch: 5 s of audio was stored as 10 s at half speed. Each slot now carries its rate, and a change closes the chunk. The rerun had no wrong durations, with 4 mic switches, 186 ms lost in total, all shown as gaps, and no loss on the meeting track.

`device_case.py` runs this with the floating window from `Countdown.swift`. `pause_case.py` now skips slivers at the end of a chunk, which gave false marker readings. After both fixes it passes 8 of 8, and `stop_paused_case.py` passes 10 of 10.

**Sleep and wake, 2026-10-30, hands-on, lid closed about 2 minutes:** the first two runs found stream restarts during sleep and, after wake, two mic streams feeding one ring, because a restart from the writer thread raced the wake restart: chunks held twice the audio for their time and overlapped. Restarts now run only on the main queue and wait for wake. The third run: 126 s gap marked on both tracks, timeline correct at Stop, tone and mic present after wake, no overlaps. Gaps just after wake were 18 ms on the mic and 90 ms on the meeting track.

`device_case.py <helper> <work> sleep` runs this case. `pause_case.py` and `stop_paused_case.py` still pass on this build.

**Permission switches, 2026-10-30, hands-on:** Microphone and System Audio Recording were turned off and back on, each for 30 s, during a recording. Neither track reacted: no event, no gap, real audio throughout. On this macOS a switch does not reach a stream already running, so `permissionLost` cannot be expected mid-recording. The Privacy condition here is at the next stream open, which this case did not test.

**Restart during a recording, 2026-10-30, hands-on:** a Mac restart from the Apple menu ended the helper without a clean Stop. The lock was free after the restart, and `sealAudio` recovered 8 finished chunks on each track, 40.0 s. The open `.part` on each track held headers only, so it went to `damaged`, and less than the 1 s page interval was lost. The restart's exact moment was not logged, so that bound is the measure, not a timed loss. The test recording was deleted afterwards.

**Test Teams call, 2026-10-30, hands-on, 11 minutes, own devices only:** the Mac recorded Teams by app, on all 4 of its audio processes, while a phone in another room read a public article into the call and the Mac played it aloud. No gaps on either track. `call_offset.mjs` compared the tracks' loudness in 20 s windows, and 20 of 21 matched. The mic followed the meeting track by 58 ms at first, settling to 44 ms by 150 s, then stayed at 43 to 45 ms to the end. The 44 ms includes output delay and travel through the room, so it is not all sync error. This is a test call, not T18: the real call still needs a call of about an hour. The recording was deleted afterwards.

**Mac call drift, 2026-10-31, hands-on, 2 h 29 min:** the Mac recorded a Teams call by app, on all 13 of its processes, with both computers in one room. 1,793 chunks saved on each track, with no write errors, gaps or restarts, and the helper exited cleanly. `call_offset.mjs` used 49 of 298 windows. The mic followed the meeting track by 67 ms at start and end, so drift was 0 ms, with a 17 ms spread between windows. The drift target is under 50 ms over 4 hours. No window matched in the first 30 minutes and the last match was at about 140 minutes, so the figure covers about 30 to 140 minutes. This differs from T18 as written: it matched loudness on real call audio, not a click train with invented content. Accepting it for the Mac is the owner's decision at Gate 2. The 67 ms includes output delay and travel through the room, so it is not all sync error. T18 still has to run on Windows. Only these aggregate numbers were kept, and the recording was deleted afterwards.

**Worker restart, 2026-10-30, real helper, tone playing, muted:** `restart_case.mjs` killed the worker at about 7.3 s and started another 2 s later on the same clock. Times carried on after the kill, the new chunks took numbers 2 and 3 on both tracks, and nothing was replaced. Recovery marked one `audioMissing` gap per track: 2.47 s on the mic and 3.19 s on the meeting track. The meeting track's open `.part` had no finished page, so it went to `damaged` with about 1 s of audio, the page interval. With nothing playing, the whole-computer track has no chunks and all of it is marked missing, so this case needs a sound playing. It drives the helper directly, so the app's restart path still has unit tests only. The test recordings were deleted afterwards.

**Gate 2 long run (T15), 2026-10-31, 01:24 to 05:24, unattended and muted, real helper through `RecordingSession`, tone on the meeting track, default mic:** `long_run_app.mjs` ran 5 pauses of 30 s, a device change of 288 s, a worker kill, and a pause spanning a second device change. Timeline 14400.121 s, status `ready`, no `.part` left, no write errors, no numbering clash, no chunk over 5.2 s.

| Measure                   | Microphone             | Meeting              |
| ------------------------- | ---------------------- | -------------------- |
| Chunks                    | 2854                   | 2850                 |
| Audio missing, all marked | 4.71 s                 | 0.71 s               |
| Longest gap               | 3.85 s (device switch) | 0.71 s (worker kill) |

This meets the 4-hour limit of 15 s per track with no single gap over 5 s. Audio plus gaps exceeds the timeline by 22 and 31 ms, so nothing is unaccounted for. Chunk starts on the two tracks stayed -16.5 to +36.1 ms apart where they line up; device switches shift the mic's chunk boundaries, so 712 of 2854 pairs do not line up and are left out. This is a timeline measure with no shared sound, because the run was muted overnight, so T18 still has to measure drift. The second input was "No Microphone", a virtual device, because the AirPods were in use. It was silent, and only the hardware cases with AirPods and the USB mic cover real devices. The recording was deleted.

**Worker limit, 2026-10-31, real helper, `three_kill_case.mjs`:** kills while recording and while paused restarted the worker with a gap of about 1.2 s each, and Resume worked after the paused kill. The fourth kill ended the session as `workerFailed` in 8 ms, after 3 restarts. Saved chunks were intact.

**Open fault, brief refusal:** with `writer.lock` held 3 s after a kill, all three restarts were refused in 90 ms and the recording ended. Retries need a delay. Not fixed.

**Open fault, 44.1 kHz input:** `Chunks.swift` accepts 8, 12, 16, 24 and 48 kHz only. On a 44.1 kHz input every chunk open fails with `writeError`, so mic audio is lost while the app still shows Recording, and nothing in `apps/desktop/src/main` or `packages/app-core/src` handles `writeError`. "Steam Streaming Microphone" showed this for 0.6 s in a rehearsal. A USB mic at 44.1 kHz would likely fail the same way, so fix this before the USB case. Not fixed. The Windows helper was not checked.

**Electron with the final pass, 2026-10-31, `real-final-pass.spec.ts`, muted AMI clip, 60 s:** Stop reached `ready` within about 8 s, the 2 s poll being the limit of that figure, and 113 words showed on the Recordings screen. The mic line in that transcript is one short phrase from a quiet room, possibly a hallucination, so check the VAD on quiet mics. The list shows 0 speakers because `meetings.ts` hard-codes `speakerCount`. The test recordings were deleted.

**Capture fault fixes, 2026-10-31, real helper, muted (`docs/plans/capture-fault-fixes.md`):** both open faults above are fixed.

- **Restart waits:** with `writer.lock` held 3 s, the third try succeeded and the recording carried on, with a gap of 4.73 s on both tracks, inside the 5 s limit. Held 10 s, it ended as `workerFailed` 3.6 s after the kill with saved audio intact. The four-kill run was unchanged: gaps of about 1.2 s, and the fourth kill ended it in 7 ms.
- **Unsupported rates:** `resample_check.swift` passed at 22.05, 32, 44.1, 88.2, 96 and 192 kHz over 60 s: exact length, 1 kHz pitch, no clicks. `long_run_app.mjs` ran 360 s with the mic switching 48 to 44.1 kHz and back, the output at 44.1 kHz, pauses and a worker kill: status `ready`, 50 mic and 45 meeting chunks, 57 and 42 ms unaccounted, longest gap 0.45 s. `pause_case.py` at 44.1 kHz passed 3 of 3 with a 9.5 s pause, and the helper's `converting` event proved the meeting path ran. An earlier run failed the marker check right after the output rate changed, when the tap's first audio arrived 0.99 s late so the marker outlasted the 7.5 s pause; the 48 kHz baseline passed, and no marker reached a chunk before the cutoff. Electron with mic and output at 44.1 kHz gave 139 words from the final pass in about 8 s. Output was muted, so those words came from the meeting track, and speech through the mic at 44.1 kHz is still unproven.
- **Write failures:** `disk_case.mjs` filled a real 2 MB volume. Each track sent one `writeError`, recording kept running, and only finished chunks were logged, with the rest left as `.part`. The app warning is unit tested. A converter that fails to start was checked only in `resample_check.swift`, not forced inside the helper.
- **Still open:** a live change of a device's rate with no device switch, such as in Audio MIDI Setup, is not detected, because the helper reads the rate only when a stream opens. The USB mic run on 2026-11-02 is the real-device check for 44.1 kHz speech. Windows is not checked.

**Stopped stream (T6), 2026-10-31, real helper, muted, `stream_stop_case.mjs`:** a test-only build (`SWIFT_FLAGS=-DFAULT_HOOKS`) stops one stream with no error. The first run gave three findings, all fixed:

- Gaps were 5.3 s, over the 5 s limit, so the stall limit dropped from 5 s to 3 s.
- The app ignored `streamDead`, so the user was never warned. It now warns once until the stream reopens.
- A failed reopen was never retried. It now retries about every 3 s until the device returns.

| Case                    | Stopped  | Detected | Reopened | Marked gap               |
| ----------------------- | -------- | -------- | -------- | ------------------------ |
| Mic                     | 12.001 s | 15.233 s | 15.313 s | 3.32 s `audioMissing`    |
| Meeting, followed app   | 12.001 s | 15.182 s | 15.272 s | 3.36 s `audioMissing`    |
| Meeting, whole computer | 12.002 s | 15.166 s | 15.237 s | 3.26 s `possiblyMissing` |

Worst-case detection is about 4.1 s. With a bad mic ID, reopen was retried every 3 s and the rest of the meeting was marked missing. When the only sound ended, on either path, no false `streamDead` came in 25 s. A real unplug and AirPods removal are not part of this case; the device runs above cover the AirPods.

**Still open, low risk:** a track still dead at Stop leaves its last chunk without a `stop` reason, so sealing reports `recovered`, not `ready`, and the final pass does not run. The gap is marked correctly and no audio is lost.

**Harness faults found before the load run:** `tone.m4a` lasts 600 s and `long_run_app.mjs` plays it once, so the 4-hour run on 2026-10-31 may have had real sound on the meeting track only for its first 10 minutes. Its chunk and gap figures stand, and the load run uses a 4.3-hour tone. That script now reports peak levels each minute and logs if the tone or the load ends.

**Load run, 2026-10-31 20:45 to 00:46, unattended and muted, final helper, 4.3-hour tone, default MacBook mic, 5 of 10 logical cores spinning below normal:** status `ready`, no `framesDropped`, no `streamDead`, no chunk over 5.2 s. The tone and load ran to the end, and the meeting track peaked at -11 dB in every minute's report.

| Measure               | Limit | Microphone | Meeting          |
| --------------------- | ----- | ---------- | ---------------- |
| Chunks                |       | 2858       | 2855             |
| Audio missing, marked | 15 s  | 12.18 s    | 8.90 s           |
| Longest gap           | 5 s   | 3.96 s     | **5.52 s, over** |
| Unaccounted           |       | 9 ms       | 23 ms            |

The loss limit passes and every gap is marked, but **the 5 s limit fails on the meeting track**. On the mic, gaps of 3.96 s and 1.56 s sit 11 ms apart, so that track lost about 5.5 s at the same moment. Both tracks had a burst of gaps from about minute 56.7 to 57.4 (21:42:53 to 21:43:44). `coreaudiod` logged IO overloads system-wide across that span, and the system log was unusually busy with many background services. Swap read 4.7 GB the next morning. The owner reports having opened several apps at about that time and closing them on noticing the lag, which fits these logs and is the likely trigger, though the logs do not prove it. Packets kept arriving often enough that the 3 s watchdog did not fire, so a stream rebuild would not have helped. All other gaps were under 1.1 s, except the device switch at 3.30 s. The recording was deleted; `sealed.json` and `events.jsonl` stay in `~/.local/share/scrb-tests/load-4h`.

**Audio-service restart (T17), 2026-11-01, hands-on, real helper, muted, whole-computer track:** the owner ran `sudo killall coreaudiod` about 5 s after the prompt. The helper got `serviceRestarted` at once, at 35.7 s, and both tracks were back by 38.1 s. Gaps were 2.29 s on the mic and 2.49 s on the meeting track, on the same timeline with no overlaps. Both tracks closed with `stop`. A device notice followed at 43.3 s and rebuilt the mic again, with an 86 ms gap. The app ignored `serviceRestarted`, so it now raises the same warning as `streamDead`. That change is unit tested, not run through Electron with a real restart.
