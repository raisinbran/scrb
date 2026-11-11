# PR A — upstream live transcription diagnostics

Base: main `07b04ef`; integrated reviewed head `328bcc479d25cf1490602003b3b1d2739669328d`, verified by run [42967815445](https://github.com/raisinbran/scrb/actions/runs/42967815445) (macOS and Windows PASS). This follow-up commit corrects per-run analysis; its final SHA and CI are recorded in the owner handoff. This instrumentation produces a new future candidate; it does not reattribute or change the November 7 recording. No physical retest is part of this PR. Endpoint rule, filler eligibility and independently word-timed prerecorded sources on both tracks require owner decisions before any future retest.

## Enable and collect

Disabled by default. Set `SCRB_LIVE_TRACE_DIR` to an absolute **private** evidence directory before launching the app, or pass `traceDirectory` to the internal `LiveAudioWorker` options. An absent, relative or invalid configuration disables tracing. Do not use the live worker scratch directory: that directory is removed on shutdown. No UI, shared-contract or storage-format changes are required.

Supervisor and worker write separate uniquely named JSONL files directly, never through the existing worker status channel. Session UUID, worker-run number, frame track/sequence/generation and native intervals join the files. A VAD evaluation has its own ID; exact absolute interval IDs join repeated evaluations and model calls. Identical interval IDs mean identical coordinates, **not proof that different detections are unique speech**. Model calls can cover clipped pieces of a detected span; parent-span IDs preserve that relationship. Segment keys join emission, supervisor receipt and callback delivery. Sink persistence, `transcriptChanged` and DOM visibility are outside PR A.

Each stream starts with a process-specific monotonic clock and bracketed wall-clock anchor. Compare durations within one process using its monotonic clock. The offline analyzer correlates processes through their separate anchors; wall-clock adjustment and anchor uncertainty limit cross-process precision. The reported queue delay is actual supervisor enqueue-to-dispatch time, distinct from worker frame processing and recognition duration. `more`, buffered duration and per-track queue counts describe backlog without changing scheduling.

## Privacy, bounds and failure semantics

Records contain allowlisted numeric/boolean metadata, fixed stage/reason enums, track names, random diagnostic UUIDs and validated generated interval/segment IDs. No PCM, model/word text, transcripts, speaker IDs/voiceprints, arbitrary error messages, credentials, commands or paths are serialized. Errors from the writer are never sent to the status queue. File names and the caller-selected directory are filesystem configuration, not record fields.

Default bounds per stream: 512 queued records plus one in-flight batch of at most64; 8MiB file budget including reserved footer space; batches of64, asynchronous writes after a20ms timer. One supervisor and at most four worker runs impose a default40MiB per-session bound. Overflow increments dropped counters and serial gaps. File creation requests owner-only modes where the platform supports them; Windows ACLs of the chosen directory remain the owner's responsibility. No automatic evidence deletion.

Trace-write rejection/full disk is contained; capture/model work never awaits a trace flush. `trace_end` reports dropped records and observed I/O failures when it can be written. A process kill may lose buffered records or the footer; the existing supervisor hard-kill cleanup is deliberately unchanged. Files already persisted outside scratch survive normal cleanup. Missing files/footer, serial gaps, malformed input, dropped events or absent stage exits prevent absence-based attribution: analyzer diagnosis is UNKNOWN. A complete observed stage chain can show the state reached, but incomplete telemetry must not be called a root cause. This PR does not promise lossless diagnostics after a kill or failed disk.

## Offline analyzer

Run the TypeScript CLI with the repository's existing `tsx` tool, for example from `packages/transcription`:

```powershell
npx tsx scripts/analyze-live-trace.ts C:\private-evidence\supervisor.jsonl C:\private-evidence\worker.jsonl
```

Supply every process/run file from the session. Its summary distinguishes empty VAD, settle deferral, empty recognition, nonempty emission/delivery, incomplete stages and stopped work. `delayed` uses a configurable function-level threshold (default6000ms) over observed queue + recognition + correlated delivery stages. This is **not native-speech-end-to-visible-word acceptance latency**. No full coverage denominator is inferred from repeated VAD counts. Empty or malformed evidence yields UNKNOWN, never a guessed cause.

## Offline validation

Invented PCM, fake VAD/recognition and actual dispatcher with a loopback fake word-timing server: focused52tests pass, including existing PCM/supervisor/cleanup coverage. New cases cover default-off/no evidence, allowlisting, file/memory bounds, overflow/drop completeness, asynchronous I/O rejection, empty VAD, settling/repeated spans, empty recognition, joined delivery, missing/truncated trace, run restart/stopped work and behavior neutrality.

The simulated slow-model/backlog comparison uses identical100source frames and a generation discontinuity, backlog markers and750ms simulated model duration. Diagnostics on/off produced identical segments, skips, VAD/model call counts and deferrals (5VAD evaluations,2model calls,3deferrals). A5000event benchmark measured2.073microseconds per enabled `record()` call on Windows (includes sanitization/serialization/enqueue, memory-sink benchmark; not asynchronous disk completion or a production throughput guarantee). No material processing disturbance observed in the simulated workload. Actual dispatcher integration writes real files outside scratch and verifies receipt/delivery records and absence of invented word text.

Validation history: initial missing-worker detection was corrected at `1905e72`; PR #69 then made complete traces with no processing observations UNKNOWN, integrated at `553dd908`. Main integration `328bcc4` passed both platforms in run 42967815445. Whole-PR review subsequently REJECTED a mixed-run gap: healthy observations could mask another expected worker's failure or lack of processing evidence. This follow-up makes `unknown` true for any `run_failed` record and for each expected worker run without its own observations, even if other runs are healthy. Regressions use contiguous, zero-drop streams, healthy empty VAD in run 0, and run 1 with frame receipt but failure/no processing; failure after observed VAD is also covered. This remains a conservative evidence verdict, not a claim about the cause. No recording, native inference or Gate 3 approval is implied. Final follow-up CI must be checked separately; the earlier green run does not validate new code.

## PR B decision

PR B is not implemented or automatically recommended. Fake-model emission/delivery only validates tracing; it does not demonstrate the cause of the real Windows gap. Recommend sink/publication instrumentation only after an authorized PR A diagnostic run identifies delivered segments without corresponding output, or another concrete need. No retest is launched here.
