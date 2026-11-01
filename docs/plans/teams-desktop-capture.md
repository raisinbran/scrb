# Teams desktop capture on Windows

**Status:** direction chosen by the owner on 2026-10-31 (per-app plus fallback). This plan needs owner approval before code is written. Tracked as BUG-1 in `docs/bug-tracker.md`.

## The problem

Picking Microsoft Teams as the meeting app on Windows records a silent meeting track and gives no warning. The mic track still records, so the user finds out only after the meeting, when the other participants are missing.

Per-app capture cannot hear call-type (Communications) streams on the test PC. OBS uses the same Windows route and has the same limit (`native/windows-capture/README.md`, findings 16 and 17). Whole-computer capture heard the same Teams call.

## What changes

1. **Per-app stays the default.** Every other app keeps per-app capture.
2. **Teams desktop uses its output device.** When `ms-teams.exe` is picked on Windows, the meeting track records the speaker or headset Teams plays through. The picker row reads "Microsoft Teams (records all sound on its output device)", so the user knows before pressing Start.
3. **The device follows Teams.** At Start, the helper finds the device holding Teams' audio session. With no session yet, it uses the default output. If Teams moves to another device for 4 s, the track reopens there and the gap is marked.
4. **A silence check covers every per-app target.** If the target's Windows session meter shows sound while the captured track stays below -80 dB for 30 s, the app raises the existing `audioMissing` warning. The message says what is wrong and that Whole computer audio can be picked after Stop. A later app with the same problem is caught this way.
5. **Automatic widening stays forbidden (W2).** The silence check warns only. Teams' wider capture is allowed because it is shown before Start. No recording widens by itself mid-meeting.

No change to `packages/contracts/`: the picker label is the app's `name` and the warning uses `audioMissing`. The helper command in `packages/capture` gains a "device of these processes" source.

## How it could lose or expose data

| # | Failure | Handling | Test |
| - | ------- | -------- | ---- |
| F1 | Teams is on a headset that is not the default output, so the default device hears nothing | Capture the device holding Teams' session | Unit test on device choice; real call on a non-default output |
| F2 | Teams is not in a call yet at Start, then opens on another device | Follow within 4 s, mark the gap | Fault test with CommTone moving device |
| F3 | Teams' device disappears mid-call | Existing device-loss handling, then follow Teams again | T24-style fault test; real unplug when a second device is here |
| F4 | Output is muted, so device capture may record silence | Measure it first. If silent, warn and say so in the manual | CommTone test, output muted and unmuted |
| F5 | Other apps on that device are recorded: notifications, videos, a private call | Picker label, manual section, no automatic use for other apps | UI test of the label; manual review |
| F6 | Sounds from other apps reach transcripts and speaker profiles | Stated in the manual. Removing them is not possible on this route | Manual review |
| F7 | Silence check misses a silent track | Meter and level are compared every second | Fake meter tests, and CommTone Communications with a per-app target must warn within 35 s |
| F8 | Silence check fires falsely when nobody is speaking | It needs the target's meter above silence for the full 30 s | Fake meter test; idle Teams call |
| F9 | A warning repeats every second | One warning per recording until sound returns | Unit test |
| F10 | Worker restart or pause loses the device choice | Reopen uses the same source rule; timeline stays on one clock | Extend the restart and pause cases |
| F11 | Silence check adds load to the audio path | It runs off the audio threads, once a second | Regression run of T1 and the 4 h load run |

## Acceptance

- All tests above pass, and `npm run check` passes.
- T18 reruns on a real Teams call, picked as Teams rather than Whole computer audio, about 10 minutes, on a non-default and a default output if a second device is available.
- The manual section and BUG-1 are updated with the measured result.

## Not covered

- Zoom and browser targets are still untested on this PC.
- Whether Teams in a browser avoids the problem. A public report says it does.
- The Mac is unaffected by this plan.
- A true Teams-only recording would need a virtual audio driver, which V1 does not install.
