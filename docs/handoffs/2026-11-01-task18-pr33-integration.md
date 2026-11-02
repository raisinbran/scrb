# Task 18 — PR #33 integration follow-up (cloud preliminary)

PR #33 remains **draft** and stacked on PR #30 at `8e02da6`. No changes to recording scheduling, native capture, contracts, or playback.

## Integrated in this slice

- Reused PR #32's ten-minute private picker token expiration, single-use tokens, and shared `LargeModelGate`; imports and final-pass jobs now use the same gate when configured through Electron.
- Main-process `dialog.showOpenDialog` picks WAV, MP3, M4A, AAC, FLAC, Opus, and Ogg, exposing only tokens and file metadata to the renderer. Content remains checked by the existing ffprobe decoder.
- Main-process import handlers, progress/terminal events, listing, abandoned-stage recovery on startup, and import cancellation during shutdown are wired only when a local final-pass configuration exists.
- Added synthetic regressions for token expiration and cancellation after a provisional meeting is created. Import cancellation/error terminal events are emitted after cleanup attempts; incomplete cleanup reports an error rather than falsely claiming successful cancellation.
- Existing library reconciliation deletes interrupted `importing` meetings on startup; failures during reconciliation and deletion require physical verification.

## Review blockers (do not claim working imports)

1. **Recording-start preemption:** The `RecordingController.start()` scheduler in `apps/desktop/src/main/recording.ts` must call/await `imports.stopForRecording()` before opening native capture, after claiming its Start guard. Windows Codex owns this file: obtain owner approval and integrate/review that small callback boundary only after its work lands. A second serialization check must keep imports from starting while recording Start is pending.
2. **Playback manifest compatibility:** the decoder still writes `audio/meeting/chunks.json` as `{version:1,chunks:[{path,startMs,durationMs}]}`; the approved Task 19 sealed manifest uses `schemaVersion:2`, `gaps`, nanosecond timestamps, chunk filenames, and capture-origin metadata. Do not label the imported manifest secure-playback-compatible. The integration owner should add an explicit imported-manifest format/validation path and an invented-chunk regression, without fabricating native capture data or changing secure playback ad hoc.
3. **Real installed codec checks:** WAV, MP3, AAC-in-M4A, ALAC-in-M4A, FLAC, Opus and Ogg on Windows/macOS. Verify source hash/mtime unchanged, decoded duration/chunk count, progress/cancel, ffprobe content validation, and no ghosts after restart. The existing fixture suite includes six formats but no separate Ogg fixture. The decoder currently accepts Ogg only when its contained codec is Opus or FLAC. Standalone `.aac` is offered by the picker but rejected by the decoder's extension allowlist: restrict picker to supported extensions or explicitly approve/implement raw AAC rather than claiming support.
4. **Cleanup failure:** simulate `discardImport()` returning `ok:false`, failing stage deletion, and process death during provisional creation; confirm no ghost meeting remains after reopen and that UI reports incomplete cleanup rather than success.
5. **Runtime/CI:** run final-head macOS and Windows CI, Electron smoke, and native installed-app integration before approval. This chat cannot execute repo npm locally because GitHub clone DNS is inaccessible.

## FFmpeg and licenses

`packages/transcription/scripts/build-ffmpeg.sh` pins FFmpeg 9.0 and libopus 1.6.1, with LGPL-oriented flags and no enabled GPL/nonfree build options. The actual Windows FFmpeg binary/build is still unresolved; do **not** equate documentation with validated redistribution rights. Verify installed `ffmpeg -version`, `ffmpeg -L`, `ffprobe`, configure flags, replaceability and packaging license notices on both platforms. Preserve the separate AAC patent assessment.

No Gate 3 approval, PR merge, or native acceptance claim is authorized.
