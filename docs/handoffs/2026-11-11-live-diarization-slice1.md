# Live meeting speaker attribution: slice 1

Owner authorized only the smallest first slice, reporting independent plan/code-claim spot review by Claude Sonnet 5.5. Plan-only commit `33e865d` precedes implementation on main base `6d96f5f9470614f49ff32fdd98443ef7fe780413`. Independent review of the resulting implementation remains pending; no merge is authorized.

## Result and Limits

Meeting PCM enters a 160,000-sample ring; every five seconds an independent, abortable Sherpa process segments up to ten seconds and embeds speech regions of at least 1.5 seconds. No speaker inference is awaited by ASR or frame ACK. A busy hop drops new work; stale, stopped, boundary and generation results are discarded. Failure/timeout disables speaker work until the next discontinuity. At most 256 cluster allocations, 128 spans per hop, 64 retained transcript parents, and one hop are held; embeddings never enter transcript events or storage. Mic stays You. Worker-run namespaces isolate restarts; a restart begins fresh clusters, so identities are stable within a run, not voice-reidentified across restarts.

Overlap/midpoint matching attributes evidenced words and leaves unmatched words as Meeting. Recent parent segments can receive asynchronous attribution after ACK. The supervisor validates that words and timing match the original and validates speaker metadata. The sink splits at word boundaries atomically while keeping existing word hashes. Only model-owned `Speaker ?` labels can promote; user names, profile links, merges and correction history are preserved through existing storage locks and revision checks. Existing `transcriptChanged` replacement events carry the persisted result. UI, shared contracts and Electron security settings are unchanged; no dependencies were added and no audio/models are committed.

Historical merge/relabel of segments outside the retained window, final-pass reconciliation, cross-run voice identity, native capture, actual ASR latency, contention CPU/RSS and Windows native verification are not completed by this slice. Trace adds metadata-only speaker start/end/error stages. Queue overload still degrades live attribution through existing bounded queues rather than holding recording.

## Silent Evidence

All tests were expected below 20 minutes; no playback or real meeting recordings were used. Synthetic deterministic tests cover slow/failed/timed-out model work, generation cancellation, two-speaker word matching, absent spans, three 30-second promotions, post-ACK supervisor forwarding, correction/name preservation, stable word IDs, and revisioned events. Existing speaker/PCM/sink tests were also exercised. Final focused run: 58/58 passed; the separate new post-ACK supervisor test passed (59 distinct focused tests total). Final timeout/Stop assertion verification also passed. Detailed logs are in external evidence.

`npm run check`: typecheck and lint passed; unit run had 1087 passed, 14 failed, 25 skipped, one unhandled loopback error. These are limitations of this sandbox run, not a green check. No unchanged failed test was automatically retried. Final standalone typecheck/lint and relevant changed-code tests were checked after subsequent harness fixes. The boundary script skips rosmont branches; a separate explicit file-list check verifies no UI/contracts edits.

Exact tests unable to complete successfully in the sandbox:

- `packages/summary/test/worker.test.ts`, LlamaServerWorker: “starts the server with Metal offload and a schema request”; “merges sampling overrides into the request”; “restarts after a crash between requests”; “stops the process”; “reports a server that dies on startup”; “reports a binary that cannot be started”; “leaves no server behind when the parent process exits”. Observed loopback `listen EPERM`, including assertions expecting a different startup error.
- `packages/transcription/test/live-audio-worker.test.ts`: “runs the actual PCM dispatcher with fake VAD and a loopback word-timing model, then cleans its scratch”. Loopback `listen EPERM` led to its 30-second timeout/unhandled error.
- `packages/transcription/test/worker.test.ts`: “runs at background priority by default”. Observed priority 0 instead of >0; sandbox/process-priority constraint is provisional attribution, not an independently proven root cause.
- `apps/desktop/src/main/live-feed.test.ts`: “delivers PCM across helper restarts”; “flags live named-pipe EOF while capture continues”; “ignores EOF followed by helper exit or explicit Stop”; “isolates malformed Windows PCM frames”; “isolates Windows model startup failure”. Expected `--live-pipe`, received no pipe arguments after pipe setup; sandbox attribution is provisional for these assertion failures.

An explicitly escalated loopback-enabled integration replay used `apps/desktop/scripts/live-diarization-replay.ts`, real Sherpa, the actual worker/supervisor/sink/storage/event chain, deterministic VAD/timed-word stubs and ES2004a seconds 0–600, with no audio output APIs. Corrected run exited 0: four promoted meeting display labels, 120 completed hops, 255 persisted revisions/replacement events, 218 events carrying promoted speakers, zero worker failures/skips, queue high-water 49 frames; median/max hop wall time 58.3/286.0 ms. Stable transcript IDs and events survived library reopening. Driver elapsed 15.05 seconds and driver RSS 230,555,648 bytes are not integrated worker resource measurements. Input was accelerated in five-second batches drained by speaker trace completion, so the observed 0 ms audio-clock speaker lag is not a live latency claim.

Diagnostic DER on persisted attributed stub-word intervals against clipped 0–600 s AMI reference: 50.35% (miss 44.01%, false alarm 0.40%, confusion 5.94%, label instability 9.39%; four reference speakers/nine provisional hypothesis IDs, 0.25 s collar). This word-grid score includes uncovered intervals and is not comparable with Phase 0 continuous-span DER or an accuracy acceptance result. Final-pass/historical reconciliation remains deferred.

External local evidence: `/Users/brandonchen/Documents/ChatGPT/srcb/live-diarization-slice1-evidence-20261111/verified/`; the first run and its cleanup failure are preserved separately. Agent setup/harness errors are registered as A-104.

## Plan Failure Table Coverage (Verbatim Rows)

> | Over-splits, wrong promotion, merges | `speakers.test.ts`: seeded embeddings, join/merge, 30 s "?" rule, three speakers, absent spans, overlap, cluster cap. |

Partially covered: existing speaker tests plus new three-cluster promotion and absent-span/matching tests passed. Historical merge/relabel persistence and accuracy acceptance are not covered.

> | Lost corrections, names or words | Synthetic `live-pcm`, sink, storage tests: ID/timing preservation, two speakers inside one ASR segment, freeze, revision conflict, atomic failure, reopen, user rename/override, final relabel and Undo/Redo. |

Partially covered: deterministic word/ID/timing preservation, splitting, freeze, correction-race retry, sink failure behavior, owner rename, unchanged history and Undo/Redo; actual replay reopen/events. Final relabel and combined live attribution/profile-link/override reconciliation are not newly demonstrated.

> | Stalls, crashes, stale results | Fake slow/failed Sherpa; ACK/ASR unaffected, bounded queue, nonfatal fallback, pause/Stop/restart generation isolation, log-redaction checks. |

Partially covered: slow startup does not hold ASR, timeout/failure fallback, generation reset, Stop, bounded work and post-ACK forwarding. New model errors are suppressed and trace fields are allowlisted. Native pause/restart/recording integrity and contention/load were not demonstrated; the sandbox dispatcher test could not complete.

> | Actual multi-speaker plumbing | Replay Phase 0 **ES2004a** PCM as frames without playback, with deterministic timed-word stub and real Sherpa. Assert **>=3 promoted meeting-track display labels** (exclude "You"/"Speaker ?"), stable persisted IDs/events; measure DER and hops. |

Covered by the successful silent replay, with the word-grid DER qualification above. Windows replay and native verification remain unrun. This does not declare the overall feature complete.
