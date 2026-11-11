# Gate 3 Windows: D2 practice run results (2026-11-09 PT)

**Practice run: not scored, freezes nothing, changes no threshold.** Read-only analysis by Claude Code (Sonnet 5.5) of the owner's run of the practice checklist. Test data only (r3 assembled WAVs). Private evidence stays outside Git in `gate3-v3-preflight-20261108\practice-d2\` (`app-run`, `playback-log-real`, `endpoints-practice.txt`, `analysis`).

## What ran

- Candidate `553dd9080f452f8a54ccff5cd5fea8d6937438ae`, launched by `launch-candidate.ps1` after its check-only run passed (all hashes matched). App session log: `open wholeComputer:true followApp:""`. The app's microphone was set to CABLE Output by the owner (the script cannot read that setting; the capture shows the microphone WAV on the microphone track, which confirms it).
- Windows state from `endpoints-practice.txt`: default playback `Speakers (2- Realtek(R) Audio)` (engine mix 48000 Hz, 32-bit, 2 ch), default recording `CABLE Output` (48000 Hz, 24-bit, 2 ch). Speaker volume 10 (owner-reported; scale assumed 0 to 100). Enhancements state not readable.
- Playback log: ready file written 08:23:12.032 UTC; microphone playback started 08:23:12.322 and system playback 08:23:12.323 UTC (0.29 s after ready, limit 6 s, 1 ms apart); playback done 08:30:12.739 UTC, 420.42 s after start. Recording ended by Stop at capture time 449.29 s. Meeting status `ready`, no transcription failure, no error-level app log events.
- Time the owner pressed Record and Enter: not noted.

## Checks

| Check | Result |
| --- | --- |
| Both marker sets found | **PASS.** Microphone track (880 Hz): early tones at 4.690, 5.190, 5.690 s; late at 384.895, 385.395, 385.895 s. Meeting track (1320 Hz): early 4.650, 5.150, 5.650 s; late 384.850, 385.350, 385.850 s. Each tone 0.195 s long. Capture time = source time + about 3.7 s (the delay from Record to playback start). |
| Offset between tracks | Microphone is later than meeting by **40 ms** at the start and **45 ms** at the end: a 5 ms change over about 380 s. |
| Drift against the source | Both tracks show the source markers arriving later at the end than at the start: microphone **+205 ms**, meeting **+200 ms** over 380 s (about 0.53 ms per second). It is common to both tracks, so it comes from the playback or capture clocks, not from either route alone. I cannot tell from this run which clock it is. The matcher's offset and drift fit must allow for it. |
| Both tracks non-silent | **PASS.** Every 10-second block that holds source content is non-silent on both tracks (38 blocks each; microphone -27.5 to -19.4 dBFS, meeting -24.7 to -17.6 dBFS). The quiet blocks (10 to 20 s, 390 s onward) match blocks where the source itself is silent; they read about -95 dBFS, the digital-silence floor. |
| Format and gain | Capture is Opus, 48 kHz mono, 5-second chunks (microphone 139 chunks, 25 gaps recorded; meeting 91 chunks, 1 gap). Whole-recording level: microphone -21.6 dBFS against source -20.9; meeting -19.3 against source -21.1. After allowing 0.3 dB for the longer capture, the microphone track is about **0.4 dB below** its source and the meeting (system) track about **2.1 dB above** its source. The 2.5 dB difference between routes is **unexplained**; I did not test enhancements, loopback gain behavior or the speaker volume. |
| No bleed | **PASS** for the windows checked (0 to 12 s and 374 to 394 s): no pure 1320 Hz tone on the microphone track and no pure 880 Hz tone on the meeting track. Higher readings from an untuned first pass came from speech, not tones. |

## What this run does and does not show

- It shows the D2 route works end to end on the real Live screen with the pinned candidate: two tracks, both source files present, markers on the right tracks, no cross-track markers.
- It measures the captured system level at speaker volume 10. **One run cannot prove how changing the Windows speaker volume affects the recording.** Loopback normally taps the audio before the endpoint volume, but that was not tested; the real retest must use the same volume setting.
- Open for the D2 draft: the common 200 ms drift, the microphone-track gaps (25 recorded; I did not check them individually against the source's pauses), the 2.5 dB gain difference, and the 40 ms inter-track offset.
