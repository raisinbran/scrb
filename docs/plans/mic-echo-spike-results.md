# Echo cancellation spike (voice-processing mic): partial result

Branch `cuc/echo-aec-spike-16c88b`. Plan: `mic-echo-handling.md`, option A. Date 2026-11-13, Apple silicon Mac, macOS 27.0.1.

## What was built

- `native/macos-capture/src/VoiceMic.swift`: `VoiceMicStream` runs the mic through `AVAudioEngine` voice processing, turns ducking off (`voiceProcessingOtherAudioDuckingConfiguration`, enableAdvancedDucking false, level min), sets `ring->rate` from the delivered format, passes the tap's host time to `rt_capture`.
- `main.swift`: `open` reads `echoCancellation`; `openMic()`/`closeMic()` replace direct `MicStream` use (also in `rebuild`). Any failure to start voice processing is logged (`voiceProcessingUnavailable`) and the raw `MicStream` is used.
- `packages/capture` (`OpenCommand.echoCancellation?`), `recording.ts` and `backend.ts` pass it. It is **opt-in via env `SCRB_VOICE_AEC=1`** plus the stored setting (and not "Studio"/bypass), so nothing changes by default. No contracts change, no Electron settings change.

## Measured (6 s mic recordings, speakers silent: system volume was 0)

| | raw | voice processing |
|---|---|---|
| mic rate | 48000 | 48000 |
| chunk 0 frames (5 s rollover) | 240128 | 240000 |
| rollover gap | -27 us | -28 us |
| first-chunk start | 9.7 ms | 84 ms (about 75 ms later) |

Voice processing delivers **9 channels** at 48 kHz (planar Float32). The stream takes channel 0; whether channel 0 is the processed mic on every Mac is **unverified**. Format and chunk output matched the raw path, and the native tests (`tests/run.sh`) and `npm run check` pass. The 75 ms later first packet is real and should be checked against the PR #150 start-gap check.

## Not measured (could not be done here)

This session had no meeting-track (audio tap) permission (`permissionLost: meeting` in both modes, also with the raw path) and output volume 0, so these plan checks are **not done**: echo reduction in dB, whisper word matches, near-end accuracy, **ducking (the hard stop)**, meeting-track rate/gap with voice processing on, inter-track offset. The ducking switch exists on macOS 14+, but zero attenuation is unproven.

## Recommendation

**Do not ship yet; keep the spike code opt-in.** The format and timing preconditions look met, but the three acceptance blockers (zero ducking, meeting-track health, voice fidelity) need a run on the owner's Mac with tap permission and speaker volume up (about 10 minutes, invented/AMI audio only, per the plan's test section; `native/macos-capture/scripts/echo_spike.mjs` drives the helper). If any fails, drop A and do option C. Keep `dropRoomEcho` either way.
