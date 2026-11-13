# Plan: echo handling for the macOS capture path (plan only, no code)

Status: draft for independent review and owner approval. **No code before both.** This touches the native capture helper and the recorded audio, so it is a risky change under `AGENTS.md`.

## Problem

When remote meeting speakers play through the laptop speakers, the microphone track re-captures them. The final pass then transcribes the same words twice (once as the meeting speaker, once as "You") and the live pass may show them as extra speakers. The owner saw this on a real test.

Today:

- `native/macos-capture` records two tracks with no echo handling: the mic through a raw HAL IO proc (`MicStream`, `Capture.swift`) and the meeting audio through a process tap read via a private aggregate device (`MeetingStream`). Each fills its own ring with host-time stamps (`rt_capture`).
- `echoCancellation` (also `noiseSuppression`, `automaticGainControl`, `bypassSystemInputProcessing`) exists in the contract and Settings UI, and defaults to on, but nothing outside the settings code reads it. The UI therefore promises something the app does not do.
- Workaround (PR #143): `dropRoomEcho` in `packages/transcription/src/finalPass.ts` drops runs of 2 or more mic words that match distinct meeting words (same text, order, within 1 s). Measured on AMI with a simulated delayed copy: about 81% of echoed words dropped, 0 of 403 independent words dropped. It only works for the final pass, only where whisper heard the same words on both tracks, and it loses a user who repeats a phrase at the same moment.

Not an issue: headset or wired earphone use (nothing leaks into the mic).

## Options

### A. macOS voice-processing AEC on the mic (Apple's canceller)

The mic path moves from the raw HAL IO proc to an audio unit with voice processing (`kAudioUnitSubType_VoiceProcessingIO`, or `AVAudioEngine` with `setVoiceProcessingEnabled(true)`). macOS uses the system output as the echo reference, so it cancels whatever the speakers play, in real time, for both the live and the final pass.

What it needs in `native/macos-capture`:

- A new mic stream class beside `MicStream` that renders the voice-processing unit into the same `RtRing` (`rt_capture` takes an `AudioBufferList` and a host time, so the ring and everything after it stay as they are). Chosen by an `echoCancellation` field on the helper's `open` command; `packages/capture/src/index.ts` (the command types) and `apps/desktop/src/main/recording.ts` pass it from the stored setting. No change to `packages/contracts/` (the setting already exists), no change to the Electron settings or the IPC channel names.
- The existing rebuild, device-change and stall logic (`rebuild`, `faultStop`, zero-packet check) has to work with the new stream; `bypassSystemInputProcessing` ("Studio" preset) keeps the raw path.

Risks to check in a spike (these are the facts I could not confirm without hardware):

1. Voice processing can change the input device format and rate, and can disturb other streams on the same hardware. The tap's aggregate is clocked from the built-in speaker (`tapClockDevice`), so the meeting track could glitch or change rate when the unit starts. This is the main unknown.
2. It also applies noise suppression and gain control. There are properties to bypass or limit them (for example `kAUVoiceIOProperty_BypassVoiceProcessing`, `kAUVoiceIOProperty_VoiceProcessingEnableAGC`), but whether they can be set per feature on the owner's macOS version must be tested. Fidelity of the user's voice for whisper is the acceptance question.
3. It ducks other audio output by default (the remote speakers would get quieter for the user). Newer macOS has a ducking-configuration property; must be set to the minimum.
4. Added latency and a possible fixed offset between the mic and meeting tracks. Transcript timing across the two tracks and the existing clock evidence (`native/macos-capture/spikes/HandsFreeClock.swift`) must be re-checked.
5. Bluetooth hands-free microphones already run in a voice mode; behaviour there is unchanged by this option but must be included in the matrix.

### B. Subtract the meeting track from the mic (own adaptive filter)

Use the already-recorded meeting track as the far-end reference and run an echo canceller (adaptive filter) against the mic track. Two places to do it:

- B1 offline, in the final pass: read both saved tracks, estimate one delay by cross-correlation, run a library canceller (for example speexdsp or webrtc-audio-processing, both permissive licences; needs vendoring, a build step and `THIRD_PARTY_NOTICES`), write a cleaned mic track, then transcribe that. No change to `native/macos-capture` and no change to what is recorded. Does nothing for the live pass.
- B2 live, in the helper: same filter on the rings. Needs the delay between the two clocks tracked in real time and a new dependency in the real-time path. Largest and riskiest.

Technical limits: the tap hears the app's output before system volume, equalisation and the speaker and room response, so the filter must learn that path; loud speakers distort non-linearly, which linear filters remove only partly; two people talking at once (double talk) needs care or the user's voice is damaged.

### C. Improve `dropRoomEcho` (post-hoc, no audio change)

Keep the text-matching rule and add an audio test: for each mic word, compare the short-time energy envelopes of the mic and meeting tracks over the word's span at the best lag within 1 s; high correlation means echo even when whisper heard different words. Also allow fuzzy word matches. Needs the final pass to decode both tracks (ffmpeg is already used) and reads only; the recorded audio is unchanged. Still does nothing for the live pass and still cannot restore a user's words that were masked by the echo.

## Comparison

|     | Live pass fixed | Final pass fixed | Native change        | New dependency          | Size                    | Main risk                                                 |
| --- | --------------- | ---------------- | -------------------- | ----------------------- | ----------------------- | --------------------------------------------------------- |
| A   | yes             | yes              | yes (mic stream)     | none                    | about 1 week with spike | tap or meeting-track disturbance, voice fidelity, ducking |
| B1  | no              | yes              | no                   | yes (canceller library) | about 1 week            | double-talk damage, delay estimate                        |
| B2  | yes             | yes              | yes (real-time path) | yes                     | 2+ weeks                | real-time safety, drift                                   |
| C   | no              | yes (partly)     | no                   | none                    | 2 to 3 days             | false drops, misses when whisper hears different words    |

## Recommendation

1. **Do A first, as a time-boxed spike (about 2 days), behind the existing `echoCancellation` setting.** It is the only option that fixes the live pass, uses no new dependency, and makes an existing, currently inert setting true. Stop and report if risk 1 (meeting-track disturbance) or risk 2 (voice fidelity) cannot be controlled; the helper's existing raw path stays as the default fallback.
2. Keep `dropRoomEcho` as it is (it already ships and is the safety net for headsets-off or Bluetooth cases).
3. If the spike fails, do C before B: it is smaller, and B1 only if C's measured miss rate is too high.

## Unchanged by this plan

Electron security settings (context isolation, sandbox, no node integration, one call and one event channel, allowlisted names) are untouched; the helper is the same child process with one more field on the existing `open` command. `packages/contracts/` is untouched. Recorded chunk format, retention and the owner's recordings policy are untouched.

## Test plan (invented, AMI or generated data only; no test over 20 minutes)

All speech is invented or AMI; never the owner's recordings. Each item states the pass rule.

1. **Synthetic two-track fixtures, in CI, under 1 minute (for B1 and C).** Build a meeting track from an AMI clip (or invented text spoken by a text-to-speech voice), build the mic track as that audio delayed 40 to 400 ms, attenuated, passed through an invented room impulse response and mixed with low noise, plus a second AMI speaker as the near-end "user" in a chosen window. Measure: echo reduction in dB in far-end-only regions, near-end word recall in the double-talk window (must not drop), and the word-level drop and false-drop rates of `dropRoomEcho`, all in unit tests with fixed seeds.
2. **Spike for A, on the Mac, 10 minutes or less per run, quiet room, volume at a fixed level.**
   - Far-end only: play an AMI clip through the built-in speakers and record with the helper in four modes (voice processing off; on with default; on with bypassed noise suppression and gain; headset). Score each: echo reduction in dB against mode 1; whisper words on the mic track that match the meeting track (reuse the `dropRoomEcho` matcher as the counter); WER of the meeting track against the AMI reference (the meeting track must not get worse).
   - Near-end: play a second invented or AMI voice from a separate small speaker at the mic while the first plays through the laptop; score the second voice's word recall on the mic track with processing off and on (accuracy must not fall by more than 3 points).
   - Meeting-track health: compare the meeting track's rate, chunk gaps and the existing `health` events with processing off and on; any rate change or gap is a fail for that mode.
   - Timing: cross-correlate the two tracks with a click played through the speakers, off versus on; report the offset change in ms.
3. **Real-app smoke:** `npm run check` and `npm run test:smoke` unchanged; the helper's existing tests under `native/macos-capture/tests/` (`run.sh`) with the new stream on and off.
4. **Owner check (optional, 5 minutes, after the above pass):** the owner reads fixed invented sentences while an AMI clip plays through the speakers; transcript shows no duplicated words and the owner's words intact.

## Process

Branch `cuc/` from `main`; automated checks before independent code review; ChatGPT independent review of this plan and then of the code before merge; no merge without the owner; usage row and any agent error in the `agents/` registers. Any test expected over 20 minutes needs the owner's approval first.
