# Capture Fault Fixes — QA Review

**Review date:** 2026-10-31  
**Repository:** [`raisinbran/scrb`](https://github.com/raisinbran/scrb)  
**Plan reviewed:** `capture-fault-fixes.md` (72-line uploaded draft; worktree path `.claude/worktrees/chatgpt-qa/docs/plans/capture-fault-fixes.md`)  
**Disposition:** **CHANGES REQUIRED** before implementation; keep changes limited to the two capture faults.

## Summary

The plan is focused and its overall approach is reasonable. The review identified **two high-priority issues, two medium-priority issues, and one low-priority test correction**. These are design/code-interaction risks, **not demonstrated bugs in an implementation of the proposed changes**. No code was changed and no tests were run for this review.

| Priority | Finding | Minimal correction |
| --- | --- | --- |
| **High** | Saved-rate comparisons can miss changes in the source device rate. | Detect input-format changes from the *device rate*; use the *saved rate* for output sizing/encoding. |
| **High** | Retry delays can exceed the approved 5-second maximum single audio gap. | Measure complete crash-to-audio recovery, including startup overhead; tune delays or obtain an explicit exception. |
| **Medium** | Adding `writeError` handling can displace existing event handling and assumes all errors name a track. | Preserve health/level-meter handling; route track-specific and session-wide write errors correctly. |
| **Medium** | The disk-error path does not explicitly cover partial writes or failures when closing/finalizing a chunk. | Treat short/failed writes and finalization failures as errors; preserve the approved low-disk stop policy. |
| **Low** | Changing macOS output settings may not actually exercise a 44.1-kHz meeting capture stream. | Assert the rate delivered to the helper in the existing real-device test. |

## Findings

### 1. High — Compare actual input rates when detecting changes

**Plan:** Fault 2 says, “Chunk rollover and the rate-change check use the saved rate. Gap detection keeps using the device's rate” (line 39).

**Issue:** A 48-kHz device stream saved at 48 kHz and a 44.1-kHz device stream converted to 48 kHz have the **same saved rate**. If the rate-change check compares only saved rates, it may fail to close the old chunk and reset the converter when the device changes. This is especially consequential because the Mac Gate 2 run already caught incorrect audio duration after stale slots survived a device switch.

**Minimal correction:** Detect source-format transitions using each slot's **device/input rate** (and any other source format property the converter needs); flush/reinitialize the converter at the transition and open a new chunk. Use the **saved/output rate** for encoding and output-frame accounting. Retain device timestamps for gap detection. The planned 48 → 44.1 → 48 kHz test should verify this distinction.

**Evidence:** [`native/macos-capture/src/main.swift`, `Track.drain`](https://github.com/raisinbran/scrb/blob/main/native/macos-capture/src/main.swift); [`2026-10-30-macos-long-run.md`](https://github.com/raisinbran/scrb/blob/main/docs/handoffs/2026-10-30-macos-long-run.md).

### 2. High — Retry schedule has insufficient timing margin

**Plan:** Fault 1 retries around 0, 1, and 4 seconds and says the missing audio can reach about 5 seconds, the Gate 2 single-gap limit (lines 13–27).

**Issue:** The retry delays are not the full capture outage. Failed open attempts, lock contention, process startup, audio-device initialization, and the time until the first usable packet all add to the gap. In an existing helper test, restarting **2 seconds** after a kill produced a **3.19-second** meeting-track gap. The proposed 4-second third attempt may therefore exceed the approved **5-second** single-gap target.

**Minimal correction:** Make the success criterion the measured **last-saved-audio-to-first-restored-audio gap**, per track, rather than retry-start timestamps. Use the already-planned `three_kill_case.mjs lock` real-helper run to check the maximum. Adjust retry waits if the result exceeds 5 seconds; if the target cannot be met, document the exception for owner approval instead of declaring the limit met.

**Evidence:** [`docs/plans/capture-contract-and-clock.md`, C6](https://github.com/raisinbran/scrb/blob/main/docs/plans/capture-contract-and-clock.md); [`2026-10-30-macos-long-run.md`, worker restart evidence](https://github.com/raisinbran/scrb/blob/main/docs/handoffs/2026-10-30-macos-long-run.md); [`packages/app-core/src/recording.ts`](https://github.com/raisinbran/scrb/blob/main/packages/app-core/src/recording.ts).

### 3. Medium — `writeError` propagation must preserve existing events

**Plan:** `RecordingSession` gains `onWriteError`, and the desktop controller displays one `audioMissing` warning per track (lines 43–47).

**Issue:** `ProcessAdapter.onEvent()` currently holds **one** event listener. The controller already registers a listener for health/level-meter events when launching the adapter. Adding another listener within the session via the same setter would replace it. Also, the current `CaptureEvent` type defines `writeError` with a `message` but **no `track`**, while the Windows helper can emit both track-specific errors and a session-log write error that has no track.

**Minimal correction:** Route events through the existing adapter listener or a single dispatch point, preserving the current level meter. Add the required internal event typing in `packages/capture` (not `packages/contracts`) and handle both **per-track** and **session-wide** errors. Test that the warning appears without breaking level-meter events.

**Evidence:** [`packages/capture/src/process-adapter.ts`](https://github.com/raisinbran/scrb/blob/main/packages/capture/src/process-adapter.ts); [`packages/capture/src/index.ts`](https://github.com/raisinbran/scrb/blob/main/packages/capture/src/index.ts); [`apps/desktop/src/main/recording.ts`](https://github.com/raisinbran/scrb/blob/main/apps/desktop/src/main/recording.ts); [`native/windows-capture/src/ChunkStore.cpp`](https://github.com/raisinbran/scrb/blob/main/native/windows-capture/src/ChunkStore.cpp).

### 4. Medium — Partial and finalization write failures need explicit handling

**Plan:** Fault 2 adds errors for failed disk writes, with one error per track until recovery (lines 41 and 58).

**Issue:** On macOS, `OggOpusFile.writePage()` currently ignores the returned byte count, and `close()` does not check the outcomes of sync/close/rename/log writes. A short write or failed finalization can leave truncated audio even though the normal completion path continues. Warning on a failed initial write alone would not address that loss.

**Minimal correction:** Check for **short/failed writes** and **failed finalization** (at least data sync, rename, and metadata log persistence) where those operations already occur. Do not report affected audio as safely saved. Preserve the approved **100-MB low-disk clean-stop rule**; the new warning behavior should not supersede it. Add a targeted error-injection assertion to the tests already planned.

**Evidence:** [`native/macos-capture/src/Chunks.swift`](https://github.com/raisinbran/scrb/blob/main/native/macos-capture/src/Chunks.swift); [`docs/plans/crash-safe-chunks.md`](https://github.com/raisinbran/scrb/blob/main/docs/plans/crash-safe-chunks.md).

### 5. Low — Verify the meeting track actually enters the tested rate

**Plan:** Set output to 44.1 kHz and test the meeting track with a tone (line 66).

**Issue:** The Mac meeting tap preferentially clocks from the **built-in output**, rather than necessarily from the selected system output. Changing an output-device setting does not prove that the helper received a 44.1-kHz meeting stream.

**Minimal correction:** Log or assert the **actual input rate observed by the helper** in the planned test. If it remains 48 kHz, record that the 44.1-kHz meeting path was **not exercised**. This does not require a separate test campaign.

**Evidence:** [`native/macos-capture/src/Capture.swift`, `tapClockDevice`](https://github.com/raisinbran/scrb/blob/main/native/macos-capture/src/Capture.swift).

## What to retain / avoid adding

Keep the **immediate first restart**, the **three-restart budget**, **writer-thread-only resampling**, native handling of supported Opus rates, and **continuing the remaining track with a visible warning**. The plan's existing targeted unit and real-device tests provide a suitable verification framework. No new architecture, IPC or UI contract change, broader capture rewrite, or unrelated endurance test is recommended.

## Approval recommendation

**Changes required, then proceed.** Resolve findings **1–2 explicitly in the plan** and incorporate **3–5 as implementation/test acceptance details**. Recheck the two faults with the specified targeted tests. No repository files were changed by this QA review.

**Review boundary:** The uploaded worktree plan was compared with files available on the repository's `main` branch at review time; unpushed worktree changes to the implementation, if any, were not inspected. Runtime behavior and proposed fixes were not independently tested.
