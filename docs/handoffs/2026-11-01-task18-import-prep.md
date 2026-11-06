# Task 18 import integration — staged handoff

This branch is **preliminary import preparation**, based on `main` at `9018e42`. It deliberately does **not** claim that Task 18 works in Electron or meets Gate 3.

## Reused code

- `apps/desktop/src/main/imports.ts` and focused invented-file regressions from draft PR #8 at `476e38a`, adding ten-minute private file-token expiry.
- `LargeModelGate`, shared with the existing final-pass configuration parser and import runner, selected without copying unrelated PR #8 features.
- No changes to recording, native helpers, contracts or UI.

## Integration cut

1. **Wait for the required independent review of PR #30** at `8e02da6` and the Windows Codex recording-responsiveness work. Rebase this preliminary branch onto the approved integrated head; do not quietly replace the recording controller.
2. Wire trusted Electron `dialog.showOpenDialog` to `ImportCoordinator.chooseFile`, using WAV, MP3, M4A/AAC/ALAC, FLAC, Opus and Ogg. Never expose absolute source paths to renderer IPC. Instantiate only with configured local tools/models.
3. Install `listImports` and `ImportCoordinator.handlers` in `openBackend`; call `recoverInterrupted` on startup and `shutdown` on close. Coordinate the `LargeModelGate` with the final-pass queue, rather than letting an import use a competing large model.
4. Make recording Start preempt and await import cancellation **before native capture opens**. This touches recording scheduling currently owned by Windows Codex and requires a focused approved plan and review. Do not add it on this prep branch.
5. Fix decoder output compatibility with playback sealing. Imported `chunks.json` currently may lack `gaps`/`schemaVersion`; secure playback must not assume a complete sealed manifest without validation.
6. Validate real file types, failed/cancelled import cleanup, source hashes and model timing on both platforms. Complete independent QA before merge.

## Existing focused test coverage

`apps/desktop/src/main/imports.test.ts` covers app-owned staging recovery, private one-use tokens, successful persistence, cancellation, unreadable files and recording preemption using invented data. Real FFmpeg and Whisper tests are **not** exercised by these tests.

## Outstanding

- Local clone/npm execution unavailable because this environment cannot resolve github.com. Request GitHub CI on the draft PR; do not claim green until its head checks pass.
- Decoder licensing/FFmpeg build flags, import completion and cancellation on installed Windows/macOS, dual-track playback, security of resource protocol, true model scheduling and native capture preemption remain unverified.
- No Gate 3 approval, main merge or PR #30 edits authorized.
