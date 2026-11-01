# Mark the gap before a track's first chunk

**Status:** awaiting owner approval. Fixes BUG-2 in `docs/bug-tracker.md`.

## The problem

If a track cannot open at Start and a later retry works, its first chunk starts late, and nothing marks the time before it. In the `t18-follow` run the mic's first chunk began at 4.6 s with `missingBeforeMs` 0. Requirements say no audio is lost silently.

Two places miss it:

- The helper only compares a chunk with the one before it (`TrackPipeline::OpenChunk`), and a first chunk has none.
- The app's `trackGaps` in `packages/app-core/src/recovery.ts` only looks before the first chunk after a restart.

## What changes

1. **Helper.** A first chunk starting 100 ms or more after the timeline's start gets `missingBeforeMs` and a cause. The cause is `device`, or `permission` if that is the reason already pending. The same code serves both tracks. This is Windows only: the Mac helper is checked and fixed separately if it has the same fault.
2. **App.** `trackGaps` adds an `audioMissing` span from 0 to the first chunk's start when that start is 100 ms or more, even with no restart. This covers both operating systems, and recordings already saved.
3. **Verifier and long run script.** `ChunkVerify` and `long_run.mjs` count this gap as loss.

No contract change: the span uses the existing `audioMissing` kind.

**Why 100 ms.** 22 earlier runs on this PC started at 4 to 28 ms, so normal starts stay unmarked. The figure is the same as the existing `EDGE_TOLERANCE_NS`.

## How it could lose data, and the test for each

| Failure | Test |
| --- | --- |
| A normal start is marked as missing audio, so users learn to ignore warnings | Pipeline test: first chunk at 30 ms has no mark. `trackGaps` test at 99 ms |
| A late start stays unmarked | Pipeline test at 4.6 s. `trackGaps` test with no restart. A real run with a bad mic ID, as in `t18-follow` |
| The gap is counted twice after a restart | `trackGaps` test: restart and late start give one span |
| A pause before the first chunk is called missing audio | Pipeline and `trackGaps` tests: pause at once, first chunk after resume |
| Chunk numbering, sealing or recovery changes | Existing crash, pause and restart regressions rerun with `SCRB_TONE`. The change writes no new files |

## Not changed

Chunk writing, pause and resume, and the timeline. A mic that never opens has no first chunk, and this plan does not change that case.
