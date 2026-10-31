# Task 18 — audio-file import integration handoff

**Type:** Diff. **Baseline:** main `7790843`. **Status:** backend import engine and its tests inspected, integration code not yet implemented. This is an explicit outstanding item, not a passed task.

## Current verified source

`packages/transcription/src/importFile.ts` has `importAudioFile` and `sweepAbandonedImports`. The decoder checks **content** via ffprobe; accepts WAV, MP3, M4A, FLAC and Opus, using ffmpeg. It creates a hidden staging folder and atomically renames only after success; leaves source files untouched; supports AbortSignal, recording guard and progress. `packages/transcription/test/import.test.ts` covers every audio extension, cancel/failure, recording starting, invalid content, and source-hash preservation. These engine tests require installed ffmpeg and were **not** executed here.

## Required main-process integration, in order

1. `pickAudioFile`: Electron `dialog.showOpenDialog` on the trusted main process; register a random, single-use file token in a private map. Renderer gets only `PickedAudioFile` metadata and token, never absolute paths. Reject missing/expired tokens.
2. `importAudioFile`: resolve token then consume it; use a dedicated AbortController and an app-owned cache staging directory outside the meeting folder. Load ffmpeg/ffprobe and final-pass model paths from the same verified local setup as `createFinalPassRunner`, not from renderer request. No fake success or untranscribed imported meetings.
3. `cancelImport`: signal cancellation, await cleanup off the call thread, then emit exactly one terminal event (finished, failed or cancelled). A recording Start cancels the active import **before opening capture**; no meeting row or app-owned cache may remain after cancel/failure. Avoid changing `Library.deleteMeeting` to bypass active writer checks; use explicit `discardImport` only after import stops.
4. After a fully completed import, create a `source:'imported', status:'importing'` meeting and copy/move the staged Opus files into its assigned folder without overwriting an existing recording. Persist transcript using the app-core final-pass conversion, then update to `ready`; on any intermediate failure, remove this provisional meeting and stage. Existing `Library.reconcile` removes interrupted imports at startup.
5. Bridge `importProgress`, `importFinished`, `importFailed`, `importCancelled` with allowed calls/events. Reuse `packages/transcription/test/import.test.ts` and add main-process tests for: no paths crossing IPC, single-use token, cancel, Start preemption, file errors, and restart while provisional import exists.

## Primary-agent decisions and verification

- **Recommendation:** imports always require final-pass models in V1; if unavailable, return a visible `notImplemented` error before consuming the picker token.
- **Recommendation:** recording takes precedence immediately; cancellation sends a clear `recordingInProgress` failure rather than a user-cancelled status if a new recording caused it.
- **Unresolved:** actual FFmpeg build license, including binary configuration and redistribution. Run `ffmpeg -L` / inspect packaging flags on both platforms. Do not infer a binary's license from FFmpeg's website alone.
- **Missing:** integrated handler code, main-process tests, real Electron picker tests, `npm run check`, platform and install tests. **Do not mark Task 18 complete for Gate 3.**

No changes to `packages/contracts/`, Electron security, or imported source files.
