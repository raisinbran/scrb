# Task 14 — Gate 2 capture test mapping (QA follow-up)

Baseline: `docs/plans/capture-contract-and-clock.md` and native/JS replay source at `qa/chatgpt-followup` `042c326`. **Native tests were authored, not compiled or run here.** T21 uses an **invented** 300-second flag stream, because the original 300-second/1281-flag log was not found in the repository.

| Case | Test and present coverage | Remaining verification |
| --- | --- | --- |
| T1 — timestamps and drift ≤100 ms | `native/windows-capture/tests/PipelineTests.cpp`: `TestRolloverAndGaps` verifies 5s timestamp-derived boundaries; `packages/app-core/src/recording.test.ts` verifies one clock origin across restarts | **No real packet-to-shared-sound or two-track hardware drift test**; Gate 2 Mac/Windows runs |
| T2 — invisible ≥2 ms gap | `packages/app-core/src/recovery.test.ts` `T2: marks a real 3 ms discontinuity`; native `TestRolloverAndGaps` checks stamp jump | Run native replay; hardware confirmation outstanding |
| T3 — standby stale packet burst | Native `TestStandbyLoss`, `TestWake` and optional `TestRealStandbyLog`; `TrackPipeline::OnPacket` drops pre-wake stale packets | Replay original standby CSV and real sleep/wake on Windows; cannot prove device behavior in JS |
| T3b — silent hands-free switch | Native `TestMarks` tests `possibly-missing` near output change, preserving silent marker | Real headset mode-switch window; no direct Mac hardware test |
| T8 — default device flaps every 4 s | `Session.cpp` has default-device change tracking; **no standalone 4s/5s debounce test seam found** | Add Session replay seam/fault injection on Windows; run 4s toggles and confirm no thrashing |
| T13 — confirmed pause spans | `packages/app-core/src/recovery.test.ts` `T13: preserves two confirmed pauses`; native `TestPauseAndLoss`, `TestFastPause` | Real pause/device change |
| T14 — valid complete chunks and sequence | `packages/app-core/src/recovery.test.ts` `T14: retains original chunk sequence and every Ogg page`; native `TestRolloverAndGaps` | Run real chunk CRC checks; damaged/missing native file injection |
| T21 — 1281 discontinuity flags in 300s | **Added** native `TestFlagStorm` (invented flags plus one real 40ms gap); `TrackPipeline` rate-limits flag-only splits to at most once/second while still splitting real stamp gaps. Asserts bounded chunk count, all frames, sequential seq, and detected gap | Build/run `PipelineTests.exe` on Windows; compare against real 300s log when available |

Run native `build.cmd` on Windows and invoke `build\\bin\\PipelineTests.exe` with optional standby CSV. The T21 fixture is **not the original log**. No Task 14 hardware evidence is being claimed.

**Not run:** `npm run check`, Prettier, `npm run test:smoke`, Windows C++ compiler, native PipelineTests, Mac hardware, Gates 2/3 long runs. No contracts changed.
