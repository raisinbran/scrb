# Plan: real-pipeline live multi-speaker diarization

**Proposal; independent review and owner approval required before code.** Base: `main` `6d96f5f9470614f49ff32fdd98443ef7fe780413` (2026-11-11). Scope: provisional meeting-track speaker attribution, not capture, audio files, renderer IPC, or shared contracts. **Data risk:** a model relabel could overwrite frozen corrections or user speaker decisions.

## Proven foundation and current gap

V1 requirements v1.2 line 36 requires true live speaker grouping, provisional until final. Phase 0's `phase0/probes/live-diarization/LiveDiarize.cpp` (`inc`), `phase0/scripts/score_der.py`, and `phase0/evidence/gate-0.md` proved a **10 s window / 5 s hop**, >=1.5 s embedding region, cosine join **0.50**, centroid merges and **"Speaker ?" until 30 s cumulative speech**. Three AMI meetings scored live DER **25.3-29.1% Windows**, **25.5-32.3% Mac**; overlap remains weak. Earlier whole-window matching failed (51-56% DER). `packages/transcription/src/livePass.ts` already uses `LiveClusterer` (`speakers.ts`); its AMI replay is **not** the active native pipeline.

Active path: `apps/desktop/src/main/live-feed.ts` -> `packages/transcription/src/liveAudioWorker.ts` -> `liveWorkerEntry.ts` / `livePcmEngine.ts` -> `apps/desktop/src/main/live-transcript.ts`. The engine (~396-397), supervisor (~553-555), **and** sink (~105) each force `you`/`meeting`; `readLiveSetup` has no speaker-model paths.

## Implementation slices (separate reviewable changes)

1. **Isolate inference.** Keep mic as `you`/"You"; diarize **meeting PCM only**. Add a bounded 10 s 16 kHz ring and independent, cancellable Sherpa sidecar (`diarizeWindow`, `embedPcm`) every 5 s; reuse `LiveClusterer`. Never await speaker work before ASR, a PCM frame ACK, or native recording. Discard delayed hops; clear pending work on pause/generation change/Stop. Missing or failed speaker model degrades labels, **not audio or transcript words**.
2. **Assign provisional speakers.** Align diarized spans to timed ASR words (overlap/midpoint), split a multi-speaker 4 s ASR segment at word boundaries, and preserve word text, timing and IDs. Emit internal validated span/merge metadata; reject stale results across worker restarts. Use stable per-session cluster IDs, display "Speaker ?" before the 30 s threshold, and promote to "Speaker N" afterwards. No confident attribution without a span.
3. **Persist safely.** Forward speaker IDs through the supervisor and `LiveTranscriptSink` instead of rewriting them. Reuse locked, atomic, revisioned transcript writes and existing `transcriptChanged` replace events. **Important gap:** `replaceLiveSegments` adds new speakers but cannot update an existing speaker's label; introduce a narrow **model-owned** speaker-label/merge update without altering `userNamed`, profile links, speaker overrides, corrections or Undo/Redo. Handle out-of-order merge notifications, bounded queues and UI revision-gap reloads.
4. **Reconcile after Stop.** `finalPass.ts:diarizeTrack/decideSpeakers/relabelClusters` independently relabels the whole **meeting** track; final `speaker-N` IDs need not match live numbering. `packages/storage/src/corrections.ts:applyFinalPass/mapSpeakers` preserves frozen words and carries user-confirmed names by temporal overlap; test conflicting overlaps and avoid stray active live placeholders. `packages/app-core/src/final-pass.ts` then performs profile matching; live clusters must **not** auto-name, grow profiles or persist voiceprints. Retain profile thresholds, local deletion and import opt-in rules.

## Contract, performance and failures

**No change proposed to `packages/contracts/`; no owner-approved fields needed.** Reuse `Speaker.id/label/kind/profileId`, `TranscriptSegment.speakerId`, `TranscriptWord.state='provisional'`, and `TranscriptChanged`'s `revision`, `replace`, `removedSegmentIds`, and `speakers`. Span/merge events remain internal, not new renderer IPC. Any future UI confidence/history fields require a separate, exact-field owner proposal.

Phase 0 speaker workload (4 CPU threads): Windows RTF **0.03-0.04**, worst 5 s hop **1.2 s**; Mac RTF **0.011-0.012**, worst hop **0.34 s**, peak **371-459 MiB**. These are **not integrated-worker measurements**. Budget <=4 speaker threads, <=10 s PCM ring plus bounded metadata, no waiting on ASR/ACK, no accumulating hops, 6 GiB recording envelope. Preserve live **text** median <=3 s and >=95% within 6 s; report **speaker-label delay separately**. Measure CPU, RSS, queue and lag under contention; degrade diarization first.

| Failure risk | Deterministic, silent proof |
| --- | --- |
| Over-splits, wrong promotion, merges | `speakers.test.ts`: seeded embeddings, join/merge, 30 s "?" rule, three speakers, absent spans, overlap, cluster cap. |
| Lost corrections, names or words | Synthetic `live-pcm`, sink, storage tests: ID/timing preservation, two speakers inside one ASR segment, freeze, revision conflict, atomic failure, reopen, user rename/override, final relabel and Undo/Redo. |
| Stalls, crashes, stale results | Fake slow/failed Sherpa; ACK/ASR unaffected, bounded queue, nonfatal fallback, pause/Stop/restart generation isolation, log-redaction checks. |
| Actual multi-speaker plumbing | Replay Phase 0 **ES2004a** PCM as frames without playback, with deterministic timed-word stub and real Sherpa. Assert **>=3 promoted meeting-track display labels** (exclude "You"/"Speaker ?"), stable persisted IDs/events; measure DER and hops. |

**Smallest first slice:** meeting ring + Sherpa hop + word/span matcher + supervisor/sink attribution + persisted speaker promotion + transcript event, demonstrated on a long enough ES2004a excerpt. Follow with safe retroactive merge/relabel of historical segments before declaring the feature complete. AMI/model availability and integrated accuracy/load **unverified**; no tests or sound used for this plan.

**Windows after implementation:** cross-platform CI; silent Windows AMI worker replay; separately approved short native Windows verification of mic/meeting recording integrity, live text median/p95, ACK/drop/restart/Stop, failed-model fallback, CPU/RSS and log privacy. Do **not** silently reopen Windows Gate 3 or repeat 4 h/8 h tests. Process: independent plan review -> owner approval -> branches/checks -> independent code review -> owner merge decision.
