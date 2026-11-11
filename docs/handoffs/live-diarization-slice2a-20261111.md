# Live diarization slice 2a handoff — 2026-11-11

Owner approved item 1 only; independent plan review by Claude Sonnet 5.5 was owner-reported. Slice 2b is excluded. Origin/main was fetched at f072dac; first commit 772f21e records the previously untracked plan verbatim.

Contract preflight: storage Speaker (`packages/storage/src/formats/transcript.ts`) differs from contract Speaker. Optional backend-only `modelMerge: { workerRun: string; generation: number; order: number }` marks model aliases; legacy/unmarked aliases are protected. No contract field is needed. No UI, Electron settings, dependency manifests/lockfiles, models or audio changed.

The worker forwards bounded run-scoped merge metadata after retained revisions. Supervisor validates current run/generation/order and keeps a separate coalesced notification map. The sink keeps a separate bounded merge map (1024: four permitted worker runs × 256 allocated IDs), drains pending work and retries revision conflicts at most three times. Storage rereads under the meeting lock, protects user decisions and connected aliases on both sides, rejects cycles/dangling IDs/final transcripts, and saves one revision without user history. Replacements cannot bypass protected speakers. publishEdit broadcasts saved replacements; reload reads persisted aliases.

Verification: initial `npm run check` typecheck/lint passed; tests: 1106 passed, 14 failed, 25 skipped, one unhandled loopback EPERM; 69 files passed, 4 failed, 2 skipped (36.08s). Boundary command was short-circuited by tests; separately invoked boundary command reports branch-name skip (rosmont/*). No failed environmental tests rerun; no test approached 20 minutes. Updated focused storage/corrections: 32 passed; sink: 16 passed; real-centroid late-merge test passed; updated supervisor coalescing test: 1 passed (14 intentionally filtered).

The following exact tests did not complete successfully in the sandbox. Seven summary tests and the actual dispatcher test encounter denied 127.0.0.1 listen; remaining six failures are unchanged-test assertions (priority or missing --live-pipe argument), whose baseline cause was not established. They are not represented as sandbox-proven application passes.

- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > starts the server with Metal offload and a schema request`
- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > merges sampling overrides into the request`
- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > restarts after a crash between requests`
- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > stops the process`
- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > reports a server that dies on startup`
- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > reports a binary that cannot be started`
- `|@scrb/summary| test/worker.test.ts > LlamaServerWorker > leaves no server behind when the parent process exits`
- `|@scrb/transcription| test/live-audio-worker.test.ts > isolated live audio supervisor with invented processes > runs the actual PCM dispatcher with fake VAD and a loopback word-timing model, then cleans its scratch`
- `|@scrb/transcription| test/worker.test.ts > WorkerProcess > runs at background priority by default`
- `|desktop| src/main/live-feed.test.ts > delivers PCM across helper restarts`
- `|desktop| src/main/live-feed.test.ts > flags live named-pipe EOF while capture continues`
- `|desktop| src/main/live-feed.test.ts > ignores EOF followed by helper exit or explicit Stop`
- `|desktop| src/main/live-feed.test.ts > isolates malformed Windows PCM frames`
- `|desktop| src/main/live-feed.test.ts > isolates Windows model startup failure`

No AMI/model replay, Windows execution, native app launch, recording, playback or final-handoff/Undo rebasing verification was performed. Tests use invented data. Independent code review found protected-replacement bypass and one-shot merge loss on queue overflow; both were corrected with regressions; independent re-review found no remaining blocker. Owner merge decision remains required; no merge authorized.

Local evidence: /private/tmp/slice2a-*.log; usage proposal remains uncommitted in docs/handoffs/live-diarization-slice2a-usage-row-proposal.md.
