# Task 15 — idle microphone check

**Type:** Plan → Diff → Native. **Base:** `main` 7790843; implementation is a separate follow-up after this plan. The contract already defines `startAudioCheck`, `stopAudioCheck`, `audioCheck` and `levelMeter`; do not change `packages/contracts/`.

## Goal and boundaries

A user explicitly presses **Test mic** while idle, sees mic levels and hearing/quiet/denied states, and can stop at once. Nothing from the test is recorded or indexed. Real Start always wins. The mic test must not run when any recording is active. A Bluetooth hands-free selection gets an advisory warning before opening.

## Proposed implementation

1. **Shared helper protocol** (`packages/capture/src/index.ts`): add backend-only `beginMicCheck` and `endMicCheck` commands with per-command acknowledgments and level events. The check opens **only** a mic reader and never invokes the helper's existing `open`, which creates recording folders and files. Use a bounded in-memory meter queue.
2. **Main backend** (`apps/desktop/src/main/`): one small controller owns a dedicated probe worker; refuse a check while recording, make repeated start/stop idempotent, enforce a 120-second timeout, and stop on window closure or shutdown. `startRecording` cancels the probe before opening the real recording, not after. Do not present a successful mic check if permission is denied.
3. **Native Windows** (`native/windows-capture/`): implement the mic-only probe with OS audio callbacks, without `Session::DoOpen`/writer pipelines; permission/device failure emits `denied`/`deviceLost`.
4. **Native Mac** (`native/macos-capture/`): mirror the same probe semantics with AVAudioEngine/CoreAudio and no file writes. Both native workers must release the mic on stop, timeout, process exit and Start.
5. **UI/mock**: use existing calls and events; trigger explicitly, render meter and hearing/quiet state, and unsubscribe/stop on leaving the screen. Mock the denial, timeout and race in tests. No permanent mic-open behavior.

## Failure checks

| Case | Expected |
|---|---|
| Probe alone | No meeting row, folder, writer.lock, Ogg chunk, transcript, cache, or network request |
| Start while probing | Probe ends synchronously before Start opens the real mic; recording latency and first sample are not delayed |
| Probe while recording | `conflict`, no capture changes |
| Probe during permission denial | `denied` event, mic released |
| Device unplug/OS audio service failure | `deviceLost` or `noSignal`; worker cleaned |
| 120 s idle timeout, view closes, app quits | Prompt release, one terminal event, no zombie worker |
| Rapid Start/Stop/repeated commands | No double-close, no unhandled rejection or lost user recording |

T22 native capture checks belong to the primary agent on Windows and macOS. Use synthetic tones/fixtures only; do not involve private meeting audio.

## Remaining verification and recommendation

**Recommendation:** explicit button, no playback, no storage, 120-second cap, dedicated probe worker that cannot write files. The primary agent should confirm the exact native entrypoint and sound-level cutoff before merging. **Not run:** `npm run check`, mock/UI tests, native builds, 200 ms Start test, mic permission and device tests. This plan is committed first; native implementation remains outstanding until its source-dependent review.