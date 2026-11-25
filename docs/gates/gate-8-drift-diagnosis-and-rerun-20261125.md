# Gate 8 drift (V-e): diagnosis, verifier fix and 72-minute rerun, 2026-11-25

Owner approvals (chat, 2026-11-25): the overnight drift rerun ("Approved") and all test lengths ("All tests lengths are allowed"). Independent review pending.

## 1. Verdict

The 65.81 ms "drift" of the Nov 15 Mac run (limit 50 ms) was a **verifier artifact, not a capture clock error**. The verifier compared chunk start times of the two tracks as if chunks always have equal length. While the microphone ran at 24 kHz (AirPods handover, 05:26 to 05:29 PST) its chunks are 5.000 s long, and the meeting chunks are 5.0027 s long. Their boundaries slid apart by 2.63 ms per chunk for 25 chunks, which the verifier summed as drift. The original saved `REPORT.txt` is untouched and remains FAIL as a historical record.

## 2. Evidence (Nov 15 run, `~/scrb-long-run/gate8-mac-20261115/logs/*.chunks.log`, read only)

- Reported: worst 65.81 ms in a 4 h window, equal to the whole-run total, so the drift sat in one short stretch, not a steady slope.
- Chunk logs: from mic chunk 3197 to 3222 (25 chunks, 4.441 h to 4.476 h) the mic ran at 24 kHz with `frames` 120000, i.e. 5.000 s. The meeting track kept 240128 frames at 48 kHz, i.e. 5.002667 s. Every paired step in that stretch changed the start difference by exactly 2.63 ms; 25 x 2.632 = 65.8 ms. Outside it no step exceeded 1 ms except the re-anchors at device events (excluded by the verifier).
- Rollover is by frame count (`Double(writer.frames) >= chunkSeconds * rate`, `native/macos-capture/src/main.swift`), taken in slot-sized pieces, so chunk length depends on rate and slot size (48 kHz: 469 x 512 = 240128; 24 kHz: 120000). Chunk starts are host-clock stamps; chunk ends are start + frames/rate.
- Independent check, per track: the gap between each rollover chunk's end and the next chunk's start (the track's own sample-clock vs host-clock error) was -12.13 ms (mic) and -12.13 ms (meeting) at chunk 500, -26.13 both at 1000, -54.44 both at 2000, -80.29 both at 3000. The two tracks track each other to about 1 ms over 4 h, so there is no differential clock drift. After the event both continue at the same slope (about -0.035 ms per chunk).
- Re-computing the worst 4 h drift with a length-independent method (running sum of mic steps minus running sum of meeting steps) on the same logs gives **0.92 ms worst, 0.88 ms whole run** (`node --experimental-transform-types scripts/long-run/overnight.mjs --report ~/scrb-long-run/gate8-mac-20261115`, new code; it writes nothing into that folder).

What this does not show: no shared sound was recorded in the Nov 15 run, so true content alignment across the device switch was never measured acoustically. The logs show both tracks placed by the same host clock.

## 3. Fix (small, no contract change)

`scripts/long-run/overnight.mjs`: drift is now the running sum of each track's own end-to-start steps (microphone minus meeting), not the difference of chunk start times. Test `scripts/long-run-report.test.mjs` "does not call chunk-length differences drift": fails before (worst 264 ms), passes after. The existing test that 25 real 2.63 ms steps still fail the 50 ms limit stays and passes. The limits are unchanged. The capture code is unchanged: no capture defect was found.

## 4. Rerun (silent, isolated)

Method: `scripts/long-run/overnight-mac.sh --hours 1.2 --out ~/scrb-long-run/ve-drift-20261125` on the owner Mac (outside the repo, own folder, no app profile or library used). The real capture helper (built from this branch) recorded the default microphone (the room) and a generated 880 Hz tone on the meeting track for **4320 s (72 min)**, 2026-11-25 08:55 to 10:07 UTC, with the speakers muted (the process tap records before the volume; mute confirmed true during the run and restored after). No audio was played aloud. The verdicts below are the verifier's own report; drift is measured from track timelines, **not a shared sound**.

| Check | Result |
| --- | --- |
| Helper clean stop, timeline 4320.465 s vs 4320.0 s wall | PASS |
| Chunk continuity (864 mic, 864 meeting), no stalls | PASS |
| Drift between tracks in any 4 h (limit 50 ms) | **PASS: worst 10.68 ms**, 863 rollover steps |
| Memory / CPU (helper) | PASS (peak 41.9 MB; 2.07% of a core) |
| Meeting no lost audio | FAIL: one unmarked 10.64 ms gap at minute 19.1 (limit 10 ms) |
| Microphone no lost audio | FAIL: worst-hour net sample-clock overlap 18.6 ms (limit 10 ms, "provisional, not calibrated") |
| **Overall RESULT** | **FAIL** (not Gate 8 evidence; 72 min, not 8 h) |

Reading the drift number: the per-chunk step logs show mic -22.49 ms and meeting -11.82 ms in total. The only large step is the single 10.64 ms meeting gap at minute 19.1; without it both tracks accumulate the same -22.5 ms (differential about 0.03 ms in 72 min, 0.02 ms per hour). The 10.68 ms drift is that one gap, counted because the verifier treats steps up to 12 ms as drift. The -22.5 ms per track is the audio device's sample clock running about 5 ppm faster than the host clock; it is the same on both tracks, so it is not drift between them. It does trip the "worst hour net 10 ms" lost-audio rule on both tracks (the Nov 15 run showed 25.3 ms on both as well). These two lost-audio rules are existing, uncalibrated limits; they are a separate finding, left unchanged here.

Growth: the differential rate is about 0.02 ms per hour, so 8 hours would add under 1 ms; 72 minutes is long enough to show that no linear growth is present, not to cover the 8 h endurance claim.

## 5. What is NOT VERIFIED

- **Device-switch drift** (the Nov 15 context): no device switch was triggered (needs the owner's AirPods or an audible route change). NOT VERIFIED. The diagnosis in section 2 explains the 65.81 ms from logs only; the 24 kHz stretch was not reproduced live.
- **Shared-sound alignment** (`scripts/b0-track-sync.mjs`): needs the same beep in both tracks, which needs speakers or the owner. The tool was not run. NOT VERIFIED. Both tracks here are placed by the same host clock, so the timeline result is evidence, not proof of acoustic alignment.
- **8 h endurance, installed build, Windows**: not run. Gate 8 and V03 stay NOT VERIFIED.
- **Gate 8 / V03 status:** the 65.81 ms FAIL is explained as a measurement artifact and no longer blocks on drift; Gate 8 is not accepted until the lost-audio rules above are decided and an 8 h installed run passes.
