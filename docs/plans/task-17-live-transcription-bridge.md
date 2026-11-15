# Task 17 — live transcription, isolated from capture

**Type:** Plan → Diff → Native. **Base main:** `7790843`. The task may be developed on this branch while its phase gate remains unapproved, but must not merge into main yet.

## Reuse, not reconstruction

`packages/transcription/src/livePass.ts` already has `LivePass`, bounded per-track queues (default six), Whisper restarts, Sherpa diarization fallback, gap handling, and `onSegment`/`onLag`/`onFailed`. `RecordingController` presently sees only `health` events from the capture adapter; the only audio path reaching transcription is the sealed, 5-second-chunk final pass. **Do not claim that these chunks implement the separately approved low-latency live feed.**

## Implementation slices

1. **Adapter/native feed:** add an optional bounded, low-latency PCM stream per track from both native helpers to an independent process; keep Opus chunk recording and writer locks exactly as they are. Prefer a separate pipe/FD with explicit framing (track, timestamp, sample rate, sequence) over routing megabytes through renderer IPC. Producer must never await consumer; overflow drops live PCM and emits lag/skipped status, never saved audio.
2. **Isolated worker:** a dedicated worker process consumes the live feed and runs existing `LivePass` model logic. Limit memory/queue depth, lower scheduling priority and never hold capture filesystem or locks. Failures restart only the model process (bounded); the recording stays active and saved chunks remain untouched.
3. **Main bridge:** map live segments to provisional `Segment` records through `Library.appendSegments` / `replaceLiveSegments`, respecting frozen corrections and per-meeting revision. Emit `transcriptChanged` and `transcriptionLag` through the existing allowlisted `Backend`. Batch and page changes; never send eight-hour text over a single IPC event.
4. **Speaker merge and stop:** preserve stable speaker labels with `LivePass.onMerge` and map to backend IDs, re-resolving when the final pass arrives. Stop model workers on quit/Stop; schedule final pass independently, and record the exact live-vs-final comparison for Gate 3.
5. **UI/mock:** existing Live screen listens through the contract only, with a clear lag/failed state and manual edits protected from live replacements. No direct storage or capture imports in UI.

## Fault cases and tests

| Fault | Expected observable test |
|---|---|
| Worker is killed/hangs | Recording chunks continue; live lag/failure visible; worker restarts at most three times |
| Live queue exceeds budget | Oldest live PCM skipped with a marked live-only gap; saved chunks retain every frame |
| One track silent, paused or device switched | No synthetic words across gaps; proper two-track timestamp alignment |
| Rapid live revisions during correction | Persisted correction and cursor survive; reject only unsafe revision, not user edit |
| Worker restarts while final pass starts | No transcript file race; only one final pass per meeting |
| UI reload and 8-hour transcript | Paged revision catch-up, no unbounded event or rerender |
| Capture process crash or disk full | Existing recording recovery owns the failure; live worker cannot mask missing audio |

## Recommendations and outstanding validation

**Recommendation:** two separate data paths—audio capture writes the durable chunks; live PCM goes through a nonblocking bounded IPC pipe with drop-on-overload semantics. Keep raw PCM out of application logs, crashes and user-visible IPC. Native Windows/macOS wrappers must be reviewed before implementing their ports; do not create a live system by reading five-second saved chunks and claiming it meets the approved latency choice.

**Outstanding:** exact native PCM pipe capabilities, worker framing, lifecycle wiring, performance and audio timing on both machines, `npm run check`, UI smoke, Gate 3 AMI evaluation. No real recordings or personal transcripts used.