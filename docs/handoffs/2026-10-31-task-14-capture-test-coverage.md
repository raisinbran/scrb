# Task 14 — capture replay coverage against main 7790843

**Branch:** `rosmont/meeting-scribe-remaining-20261031`. Added focused cases to `packages/app-core/src/recovery.test.ts`. The table distinguishes verification already expressed in tests from the actual Gate 2 measurements, which remain unperformed.

| Case | Existing evidence | New test / outstanding |
|---|---|---|
| T1: packet timestamps within 100 ms | Clock-origin and worker-restart assertions in `packages/app-core/src/recording.test.ts` | **Outstanding:** actual packet-timestamp deviation against a shared sound on both machines. JS tests do not prove device timestamps |
| T2: hidden gap | Recovery test "marks a span ... missing" | **Added:** T2 3 ms synthetic gap |
| T3: sleep stale packet burst | Recovery test "marks a span after a sleep close" | **Outstanding:** stale burst drop in Windows native pipeline and hardware replay |
| T3b: headset mode switch, possibly missing | Recovery test "does not call a silent whole-computer track lost"; native output-switch window logic exists | **Outstanding:** actual hands-free switching fixture or real hardware check |
| T8: default device flaps | Windows `Session.cpp` has default-change handling | **Outstanding:** replay 4-second flaps and assert five-second stability + bounded reopens |
| T13: pause spans | Several recovery tests for pause and worker restart | **Added:** T13 two separate confirmed pauses |
| T14: complete chunks, no missing sequences | `readPages` CRC checks and crash-repair tests | **Added:** T14 clean seal with sequences 0,1,2 and full pages. Native missing-sequence injection remains outstanding |
| T21: 1281 flags in 300 s | Native `TrackPipeline.cpp` currently splits when `p.flagDiscontinuity`, even with zero stamp gap | **Not passing/covered.** The 300-second source log is not in this repository. Use invented 1281 evenly spaced flag events in a 300-second synthetic stream, with 5-second chunks, asserting no more than ~300 additional flag-only splits plus all real gaps separately. Change the pipeline's flag-only debounce before running this. Do not claim this test passes yet |

**Follow-up recommendations (primary agent decides):** Make the packet replay seam directly test `TrackPipeline` on Windows; use invented T21 flags if original log unavailable. No real meeting audio. Gate 2 stays blocked on native runs for T1/T3/T3b/T8/T21. Exact `npm run check`, Windows build, real mic/call, and hardware checks **not run** for this commit.