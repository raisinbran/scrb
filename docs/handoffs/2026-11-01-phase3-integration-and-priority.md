# Phase 3 live integration and recording priority handoff

Status: preliminary source review, 2026-11-01. No app adapter or native capture code changed. Main inspected at `639a25e`; preliminary inputs: PR #8 head `476e38a`, PR #17 head `0258a1f`. Both were still draft and absent from main at review.

## Select, do not rebuild

- **PR #17:** reuse `LiveAudioWorker`, `LivePcmFrame`/`PcmFrameDecoder`, `TimedLiveSegment`, and true per-word Whisper timing from `packages/transcription/src/`. Before integration, Codex must resolve Claude's demonstrated VAD +20 ms span-overrun failure and failed/hung cleanup behavior on PR #17. Its worker is not yet connected to native capture.
- **PR #8:** select `apps/desktop/src/main/live-transcript.ts`'s bounded `LiveTranscriptSink` queue and persist-then-emit behavior, plus its narrow tests. Adapt that code rather than cherry-picking PR #8 wholesale: the present `LiveUtterance` uses one fabricated word for the entire utterance. Preserve main's existing recording/import/UI changes unless an independently reviewed integration requires them.
- **Already on main:** `Library.appendSegments`, `replaceLiveSegments`, `applyFinalPass`, `changeTranscript`, and the revision-aware display/update path. Do not create parallel transcript storage or new shared interface types.

## Adapter boundary

1. Only the **approved, independently tested native** live pipe reaches `PcmFrameDecoder` and `LiveAudioWorker.offer()`. The worker receives at most 1,600 signed 16 kHz samples per frame. Keep durable Opus writes, locks and Stop independent; model work never runs in capture callbacks. Use the revised PR #20 native proposal after Claude review and owner approval.
2. Bridge `LiveAudioEvent.type === 'segment'` to a provisional storage `Segment`. Convert `track: 'mic'` to storage `track: 'microphone'`; keep `meeting` unchanged. Preserve each `TimedLiveSegment.words[]` entry's own text and absolute `startMs`/`endMs` one-to-one; assign one **stable** word ID per actual word and stable segment/speaker IDs within a recording. Do not synthesize equal word durations or wrap a sentence as a word. Keep the worker's unique segment identity across supervisor restarts; resolve collisions explicitly.
3. Use `Library.appendSegments` for new live segments and `replaceLiveSegments` for a revision of existing provisional segments. Do not append duplicates when the model revises a segment. The latter already protects frozen corrections and can reject a conflicting revision by returning the unchanged transcript; publish **only** the saved result. Keep per-meeting ordering, revision, speakers and timestamps consistent.
4. **Persist first:** await the library write, then emit `transcriptChanged` with the saved revision and actual persisted segments. If a save fails or the revision is rejected, emit a bounded `transcriptionLag: failed/lagging` status instead of publishing unsaved words. For frozen corrections, never overwrite preserved text or IDs; final-pass `applyFinalPass` remains a separate, locked operation. The UI continues to receive paged/batched changes through the existing allowlisted events, never raw PCM.
5. On native helper restart: close the old live session and create a fresh `LiveAudioWorker` before receiving reset sequence/generation counters. Stop/quit must terminate live workers without waiting for a slow model before acknowledging durable Stop. Publish lag/failure/skipped states without audio or transcript content in logs. The final pass runs independently after Stop.

## Integration dependency sequence — Codex

1. **First:** finish PR #17's actual-model VAD clamp and bounded cleanup; rerun its focused tests and real local Whisper/VAD smoke. Have Claude review worker-only fixes. The PR #20 native proposal stays independent and requires owner approval before native edits.
2. **Second:** Codex creates a fresh `rosmont/*` integration branch from current `main`; selectively bring in reviewed PR #17 worker files and only the relevant PR #8 sink files/tests. Resolve the sink's single-word mapping **before** connecting it. Do not edit PR #8 or PR #17 branches.
3. **Third:** after native proposal approval, integrate and test Windows and macOS feeds separately. Add the small adapter/main bridge on that reviewed combined branch; then run paired native/worker/locking, source-change, privacy, persistence and correction tests. Claude performs independent full integration QA.
4. **Fourth:** prepare installed/local Gate 3 measurements using PR #19's single evidence checklist; merge or approve no gate until owner review. Start the required four-hour run on each machine as soon as the **integrated** build is available and run it alongside unrelated work.

## Minimum regression checks

- Invented mic/meeting PCM: real per-word timestamps, correct track mapping, stable IDs, preserved order and no duplicate segments on revision.
- Delay or fail the library write: no premature `transcriptChanged`; published revision equals persisted revision; errors do not interrupt capture.
- Apply a correction while a live revision/final pass is pending: original correction text and frozen word IDs survive; unsafe live replacement is discarded.
- Worker crash, restart and backlog: ≤3 worker retries, visible live-only gap, saved audio unchanged, clean stop and fresh session on native helper restart.
- Native device/source/permission boundaries, broken pipes, sleep/wake timestamp mapping, rate changes, >1,600-sample frames and durable Stop: use PR #20's safety cases, not a second checklist.

## Recording starts during active final pass

**Observed source behavior (not a measured defect):** On PR #8, `FinalPassQueue` owns one run using `LargeModelGate`, and `RecordingController.start()` awaits `stopForRecording()` for **imports and summaries only** (wired in `apps/desktop/src/main/backend.ts`). It does not abort or deprioritize an already-running final pass. The shared gate serializes final pass/import/summary jobs but does not itself grant capture priority. This may be acceptable if native capture has adequate CPU/memory headroom; no production violation has yet been measured.

**Smallest reproducible scenario for Codex:**

1. On each physical OS, use an invented or public speech meeting A. Stop A to start a **real** final pass with the intended models; confirm the worker is actively transcribing before proceeding. Record meeting A's saved chunk checksums and final-pass start time.
2. While that pass is running, start recording meeting B with **audible two-track input**. Record monotonic timestamps at button/API request, native open acknowledgement, first saved frame and visible recording state. Measure whether Start meets the existing **≤200 ms** UI response target (and separately record native first-audio readiness; do not conflate both).
3. While B records, sample CPU per capture/model process, total peak memory (target approximately **≤6 GB** during capture + live), live queue/skip/lag, model slot ownership and scheduling (continuing, deprioritized, cancelled or deferred final pass). Compare with B recorded under the same input without A's final pass. Do not assume a model pause if no such scheduler exists.
4. Stop B. Independently decode/verify both saved tracks, total frames, duration, drop/gap markers and checksums; compare with the reference tones and baseline. Check that meeting A and B have correct independent final-pass outcomes and no model overlap. Exercise Pause/Stop response under the same load (each ≤200 ms).
5. **Decision rule:** if Start/Pause/Stop, durable audio, or memory target fails specifically with the active final pass, Codex proposes the smallest recording-priority change with a deterministic fake-worker regression plus a fresh real-machine run. If it passes, retain the current scheduler; do not alter behavior speculatively.

## Unverified and assigned

- **Codex, backend:** source integration and worker fixes, then native implementation **only after owner approval**. Keep OS/device instructions separate.
- **Claude Code:** independent PR #17/PR #20/PR #19 QA, then combined branch integration and real UI verification.
- **Owner:** approve or reject native proposal before capture changes; approve gates and merges only after evidence.
- **Still unverified:** real integrated live feed on either OS, actual recording priority under final-pass load, model timing and memory, worker-kill continuity, import final-pass targets and the owner-approved four-hour Gate 3 runs. The single evidence checklist lives on PR #19 at `docs/gates/gate-3-evaluation.md`; do not duplicate it here.
