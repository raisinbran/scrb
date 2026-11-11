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
3. **Real installed codec checks:** WAV, MP3, AAC-in-M4A, ALAC-in-M4A, FLAC, Opus and Ogg on Windows/macOS. Verify source hash/mtime unchanged, decoded duration/chunk count, progress/cancel, ffprobe content validation, and no ghosts after restart. The existing fixture suite includes six formats but no separate Ogg fixture. The decoder currently accepts Ogg only when its contained codec is Opus or FLAC. Standalone `.aac` is deliberately not offered: AAC in an M4A container is supported, but the decoder's extension allowlist does not accept raw `.aac`.
4. **Cleanup failure:** simulate `discardImport()` returning `ok:false`, failing stage deletion, and process death during provisional creation; confirm no ghost meeting remains after reopen and that UI reports incomplete cleanup rather than success.
5. **Runtime/CI:** run final-head macOS and Windows CI, Electron smoke, and native installed-app integration before approval. This chat cannot execute repo npm locally because GitHub clone DNS is inaccessible.

## FFmpeg and licenses

`packages/transcription/scripts/build-ffmpeg.sh` pins FFmpeg 9.0 and libopus 1.6.1, with LGPL-oriented flags and no enabled GPL/nonfree build options. The actual Windows FFmpeg binary/build is still unresolved; do **not** equate documentation with validated redistribution rights. Verify installed `ffmpeg -version`, `ffmpeg -L`, `ffprobe`, configure flags, replaceability and packaging license notices on both platforms. Preserve the separate AAC patent assessment.

No Gate 3 approval, PR merge, or native acceptance claim is authorized.

## 2026-11-02 cloud follow-up: manifest and cleanup (preliminary)

**Source base:** PR #33 at `4294a95e868ca9771ffe0b04d9ca3db69b159c2f`; PR #30 final-head code approval is recorded in its discussion. This update does not modify native capture, `recording.ts`, IPC/contracts or protected library deletion.

- Imported `audio/meeting/chunks.json` now uses `schemaVersion: 2`, `origin: imported`, `endedBy: stop`, `endNs`, `gaps: []`, and per-chunk `file`, sequence, nanosecond start/end, 48 kHz encoded rate, **actual on-disk Opus preSkip**, imported close/open reasons and complete state. It does not invent device/capture metadata. `readChunkManifest` accepts validated v2 imported manifests and refuses future schemas, path escapes and malformed times.
- Invented-fixture tests exercise the exact v2 fields, Opus header pre-skip, unsafe files, overlapping timestamps, failure to remove staging, waiting for preemptive cleanup and process-death-style provisional-meeting reconciliation using a real test Library.
- The established FFmpeg-backed format suite still provides source-hash/mtime, duration/chunks and cancel checks. No actual model or installed-codec run is claimed for these changes.
- Task 19 preparation is isolated in **draft PR #39**; `packages/contracts/` is unchanged. The approved read-only media plan cannot give an HTML audio element a trusted URL through today's void `seekAudio` response, so the proposed **one narrow media grant** still needs explicit owner approval.

### Remaining recording-start preemption patch — protected file, owner approval required

**Do not apply in this PR without owner approval and coordination with Windows Codex's active recording ownership.** Reuse the existing `imports.stopForRecording()`, preserving PR #30's `liveSetup` argument and capture code. The minimal intended change:

1. Add an optional `beforeCaptureStart: () => Promise<void>` callback to the *end* of `RecordingController`'s existing constructor arguments; default to a resolved promise so existing tests/callers are unchanged.
2. In `RecordingController.start()`, after `this.starting = true` and the mic-check stop, `await this.beforeCaptureStart()` **before** `this.begin(title)`; preserve the current catch/finally state cleanup and do not touch native adapter launch.
3. In `backend.ts`, declare `let imports: ImportCoordinator | null = null` before constructing recording; supply `async () => { await imports?.stopForRecording(); }` after `liveSetup`; assign the existing `ImportCoordinator` to that variable afterward. Change `recordingBusy` to `() => recording?.isBusy() ?? false` so the Start guard also blocks imports during pending cancellation.
4. The regression in `imports.test.ts` proves preemption does not return until staging cleanup settles. A separate recording-controller behavioral regression must prove that native `begin()` is **not entered** until the callback resolves, and the pending Start rejects fresh import requests. No new scheduling abstraction is needed.

This callback edits protected recording scheduling and its backend integration. **Owner decision needed before a different agent edits those files.** If the Windows agent has already integrated this boundary at a later head, review/reuse that work rather than duplicating it.

### Remaining physical checks (repeat on both macOS and Windows)

1. Actual unpackaged/installed Electron picker with token privacy, expired token retry, IPC allowlisting, and cancellation UI; then verify WAV, MP3, M4A/AAC, M4A/ALAC, FLAC, Opus and Ogg with the installed FFmpeg/ffprobe and final-pass model. Raw `.aac` is not on the supported extension list.
2. Confirm each import creates a visible usable transcript with word timings and click-to-play **after Task 19 is implemented**; inspect the new v2 manifest, number/duration of playable Opus chunks and original file SHA-256/mtime, and report actual WER/time on public fixtures. Synthetic manifest tests cannot verify decoder accuracy.
3. Inject a long-running decode/final pass, Cancel, failure, app kill and reopen; verify library rows, staged cache, provisional meeting folders, single terminal event, unchanged original, and cleanup warnings when deletion fails. Start a real recording during import; record preemption/capture latency and ensure no audio loss.
4. Confirm final native cross-platform CI and smoke, process memory/model concurrency and actual binary `ffmpeg -version`, `ffmpeg -L`, configure flags, packaging license notices and AAC patent review.

**Not complete:** recording callback integration, actual imported audio playback, real installed codec/model validation and Gate 3 acceptance. Keep the draft PR unmerged.
