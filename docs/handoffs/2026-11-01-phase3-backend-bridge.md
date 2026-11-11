# Phase 3 Task 17: backend word bridge

Branch: `rosmont/phase3-backend-bridge-20261101`, stacked on reviewed PR #17
head `6e19c5360ba2050e091f0bb8fe0326b10f21d612`. Gate 3 remains open.

## Delivered

`LiveTranscriptSink` adapts PR #8's bounded persistence queue to PR #17's
`TimedLiveSegment` words. Only the sink and its relevant test design were reused;
PR #8 was not merged. Actual individual word times reach storage without making
one word out of an utterance. `mic` maps to `microphone`; `meeting` stays separate.

Deterministic word IDs retain source ownership across duplicate updates,
revisions, sink reconnects and storage-created correction fragments. Revisions
replace all fragments belonging to that worker segment. Existing correction and
display mapping code protects frozen edits and publishes only persisted changes.
Optional expected revisions on library append/replace operations allow bounded
retries when user corrections or final transcription race the write. Live work
cannot replace a completed final track. Persistence failure and worker failure
leave failed status sticky; queued provisional work is bounded and disposable.

No recording controller, native capture, UI or shared interface files changed.
No real capture, private recordings, models or model executables were used.

## Verification on Windows

- `npx vitest run --project desktop apps/desktop/src/main/live-transcript.test.ts`:
  PASS, ten tests. Invented PCM passes through the existing PCM engine with
  invented model results; persisted words are hello at 1100–1190 ms and world at
  1300–1390 ms. Other cases cover dual tracks, duplicates, revisions, correction
  fragments across reconnects, correction/final races, failed persistence,
  persist-before-publish, failed worker status and bounded pending work.
- `npm run check`: PASS, 845 passed / 63 skipped; type checks and lint passed.
  The existing boundary script skips branches outside its `ui/` and `backend/`
  prefixes. An earlier run failed the existing storage folder-rename test with
  Windows `EPERM`; the complete rerun passed without a code change for that test.
- `npm run test:smoke`: PASS, desktop build and five mock Electron tests;
  two real-audio tests skipped. Used the existing installed Electron distribution
  via `ELECTRON_OVERRIDE_DIST_PATH` with `SCRB_CAPTURE_HELPER` and
  `SCRB_FINAL_PASS_CONFIG` unset. Real capture and real final-pass tests are
  intentionally disabled for this slice.
- Changed-file Prettier and `git diff --check`: PASS.
  Repository-wide `npm run format:check` failed on existing formatting and the
  ignored downloaded Opus header/footer HTML fragments. No unrelated files were
  reformatted. Logs: `out/bridge-check-final.txt`, `out/bridge-format-final.txt`,
  `out/bridge-smoke-final.txt` (local, not committed).
- Independent test re-review found no remaining actionable bridge defects;
  its targeted rerun passed all ten tests.

## Next connection and review

Instantiate one sink per meeting and pass `sink.handle` as the worker event
callback. Worker failure must also reach that callback. Stop accepting feed data
before draining the sink with `await sink.stop()`; stop the worker separately.
The sink owns persistence only, not capture, worker restart or model scheduling.

Connect the approved native frame protocol to PR #17's isolated worker only
after PR #20 has explicit owner approval. Use the worker's stable segment IDs
and sample-derived timestamps unchanged. Keep helper/worker generations and
source boundaries in the feed layer. Windows exporter implementation and native
continuity tests belong on a separate branch; Mac work belongs to Mac Codex.

The native feed, actual Windows model pipeline in the integrated app, recording
startup during an active final pass, import checks and Gate 3 measurements remain
untested here. Change model scheduling only if the integrated measurement fails.
No endurance run was repeated. Require independent QA before merging this slice.

The draft PR must target `rosmont/phase3-live-worker-20261101`. Publication
requires `pde-gh-write`; it is unavailable on this Windows host. Do not bypass
that approval control with `gh pr create` or a GitHub mutation tool. PR text and
the exact guarded command are prepared locally for a supported publishing host.
