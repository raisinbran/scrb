# Meeting Scribe — Gate 2 follow-up handoff (2026-10-31)

**Repository:** `raisinbran/scrb`  
**Branch:** `rosmont/meeting-scribe-remaining-20261031`  
**Baseline main:** `1e89fdf270fb301e760314aeeb853bfe1895b5be`  
**QA follow-up:** `042c326adc1e360ac6aeb5bbc9bc497ed767368d`, fast-forwarded onto the branch **before** any follow-up work.  
**Scope:** exactly the five owner-assigned Gate 2 follow-ups; no Tasks 17–36 and no `packages/contracts/` changes. No library migration or `pickStorageLocation` file move.

## Commits in assigned task order

| Item | Commit | Changes |
| --- | --- | --- |
| 1. Profile deletion | `27eeecc` | Skip unreadable **inactive** `transcript.json` files, log only sanitized error type/meeting ID; still delete the profile and unlink readable transcript/undo/redo references. Busy recording/import/final-pass meetings still reject with `conflict`. Added damaged-transcript and busy-state regression tests. |
| 2. Index recovery | `9bbdfcb` | **Plan only:** `docs/plans/index-recovery.md`. Covers failed migration, stuck backup deletion, Windows AV lock, provenance/identity, good-copy checks, owner choices, retained/deleted data, and failure matrix. |
| 3. Task 14 | `ee1c323` | `PipelineTests.cpp` synthetic T21 flags (1281/300 s) plus one real 40-ms gap; flag-only split limit of one/second; replaced case matrix. |
| 4. Task 15 backend | `bdada95` | `MicCheckController`, fake tests, backend-only `beginMicCheck`/`endMicCheck` and `micLevel`, `ProcessAdapter` arguments; 120-s timer; Start preempts immediately; no normal `open`, meeting creation or saved audio from probe. |
| 4. Task 15 Mac helper | `c5cac23` | Separate `--mic-probe` code in `native/macos-capture/src/MicProbe.swift`, main selector and build entry. CoreAudio `MicStream` meter only; gate stays closed; no ChunkWriter or audio folder. |
| 4. Task 15 Windows helper | `03c6ba2` | Separate `--mic-probe` code in `native/windows-capture/src/MicProbe.{h,cpp}`, main selector and build entry. WASAPI mic-only reader; no Session/Track writer, session files, or meeting audio. |
| 5. Task 16 | `8f885ae` | Test rejected source changes during pending Start and Pause; unchanged sources remain valid; idle changes allowed. Existing recorder conflict guard was already correct. No storage move. |

**Follow-up regression/hardening commits, after the initial task commits:** `a83e73a` adds T22 integration proof that a mic check creates no recording row and yields to Start; `ae893dd` adds native terminal reasons for timeout/device loss; `3acf744` adds Windows T8 4-s flap/5-s stability and T3 stale-wake replays using a shared debounce helper; `32d0fee` makes a disconnected mic report no signal rather than falsely reporting denied permission.

## Test coverage and native split

Task 14 coverage table: `docs/handoffs/2026-10-31-task-14-capture-test-coverage.md`. T21 is **invented 300-second flag input**, not the original captured log. T1 real packet clock, T3/T3b real sleep/headset behavior and T8 OS notifications remain native/hardware verification, not proofs from JS.

**Mac patch:** `native/macos-capture/src/{MicProbe.swift,main.swift}` and `build.sh`; Claude Code should run `./build.sh` on a Mac, inspect mic permissions, manual Start preemption, headset mode, 120-second timeout and verify zero artifacts.

**Windows patch:** `native/windows-capture/src/{MicProbe.h,MicProbe.cpp,main.cpp,TrackPipeline.cpp,TrackPipeline.h,Session.cpp,Session.h,DeviceDebounce.h}`, `tests/PipelineTests.cpp` and `build.cmd`; Claude Code should run `build.cmd`, `build\\bin\\PipelineTests.exe`, probe command/ack tests, native loss/debounce tests and file-artifact checks on Windows.

The contract already defines `startAudioCheck`, `stopAudioCheck`, `audioCheck` and `levelMeter`; only backend-private capture protocol types changed.

## Open primary-agent decisions and risks

1. **Index recovery (plan only):** recommend a native startup recovery dialog first, without more IPC. If an ordinary renderer screen becomes necessary, `index-recovery.md` proposes exact TypeScript; **owner approval still required**. Never automatically restore an older snapshot over unknown later changes or silently discard the only intact index.
2. **Unrecoverable transcript on profile deletion:** skipping leaves that **unreadable** file byte-for-byte unchanged. A stale embedded `profileId` may remain if the file is later repaired. Recommend an explicit link-repair pass on recovery, not rewriting damaged JSON.
3. **Native mic probe:** helper implementations have **not** been compiled or exercised. Confirm CoreAudio/WASAPI APIs, OS permission errors, selected device changes, read-only operation, timer and prompt mic release. Windows currently reports unsuccessful opens conservatively as `deviceLost` unless permission can be proven; improve classification only with a verified OS signal. Verify the 200-ms Start target on hardware.
4. **T21/T8:** verify the new rate-limited flag logic does not suppress genuine gaps and that Windows Session debounce/reopen handles actual devices. Real 300-second flag log was not supplied.
5. **Task 16:** no library move or storage-location contract work. Maintain the existing conflict behavior until the owner approves the separate migration contract.

## Verification truth

**Not run in this session:** `npm ci` / `npm install`, `npm run check`, full Vitest, `npm run format:check`, Prettier, `npm run test:smoke`, Electron installed app, macOS Swift build, Windows C++ build, `PipelineTests.exe`, native mic/permission/Bluetooth tests, native T1/T3/T3b/T8/T14/T21/T22, real timing and 4-hour Gate 2 run.

Reason: direct GitHub checkout from the execution container failed DNS resolution; commits and source reads used the GitHub integration. Tests added to commits were **written, not executed**. The earlier QA report's 767 passed/24 skipped unit tests and 5 passed/2 skipped smoke tests refer only to `042c326`, **not** to this branch head.

**Review request:** run formatting and `npm run check` first, resolve all errors, build/test helpers on each owner machine, and review the five task slices separately. Do not merge the branch wholesale or advance beyond Gate 2 before approval.
