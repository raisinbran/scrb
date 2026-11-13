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

## Follow-up 2026-11-13: why the rest needs the owner's Mac

Re-checked after the merge of #154: this session's helper reports `systemAudio: denied` (no meeting-audio tap permission) and the Mac's output is muted at volume 0. Granting the permission and unmuting are the owner's settings, so none of the echo, ducking, meeting-track or fidelity numbers could be taken. The same plan checks, as a ready run (about 10 minutes, invented or AMI audio only, nothing committed):

1. In System Settings > Privacy & Security > Screen & System Audio Recording, allow the app you run the commands from (Terminal). Set output volume to a fixed, normal level (say 50%) on the built-in speakers, quiet room, no headset.
2. In Terminal, folder `native/macos-capture`, no admin: `export PATH=$HOME/.local/share/scrb-node/current/bin:$PATH; bash build.sh`
3. Run each mode (`off`, `on`) with the same AMI clip (`CLIP`, a wav or mp3 you chose, 60 s or less) playing at the same volume:
   `(sleep 1; afplay CLIP) & node scripts/echo_spike.mjs build/scrb-capture /tmp/echo/off off 60` then the same with `on` and `/tmp/echo/on`.
4. Compare, per mode: `for t in microphone meeting; do cat /tmp/echo/MODE/audio/$t/*.opus | ffmpeg -i - -af volumedetect -f null - 2>&1 | grep -E 'mean_volume|max_volume'; done`. Pass: mic mean level with `on` at least 10 dB lower than `off` (echo reduction) and meeting-track mean/max level unchanged within 0.5 dB (no ducking or tap disturbance). Also confirm in the script output there is no `permissionLost`, and that `chunks.log` of `meeting` has the same `rate` and no gaps in both modes.
5. Fidelity: speak a fixed invented sentence at the mic while the clip plays, in each mode; transcribe both mic tracks and compare word recall (accuracy may not fall by more than 3 points).

## Owner run and ducking investigation (2026-11-13)

Owner run (AMI clip via afplay, built-in speakers 50%, 60 s): mic quiet-level off -54.4 / off2 -47.6 / on -69.4 dB (echo reduction at least 15 dB, passes); meeting track off -47.2 / off2 -47.1 / on -55.9 dB (**about 9 dB lower, fails the 0.5 dB ducking bar**); no gaps, no `permissionLost`; owner's voice intact.

Ducking investigation: the SDK headers (macOS 14+) offer one control, `voiceProcessingOtherAudioDuckingConfiguration` (advanced ducking on/off, level default/min/mid/max). The code already sets advanced off and level `min` after enabling voice processing and before the engine starts. `kAUVoiceIOProperty_DuckNonVoiceAudio` (the "turn ducking off" switch) is iOS-only and deprecated, so it is not available on macOS. `min` is "minimum ducking", not none, and the meeting track (process tap) records the ducked level. The change now also sets property 2108 directly on the unit after the engine starts and logs the read-back in the `voiceProcessing` event (`ducking` field). Verified here only that the setting is accepted and reads back as advanced false, level 10 (min); the owner must re-run to see whether the 9 dB drop changes.

**Recommendation: drop option A for ducking** unless the re-run shows the meeting track within 0.5 dB. No other macOS switch exists, so the plan's hard stop applies; do option C.
