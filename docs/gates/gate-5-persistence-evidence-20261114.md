# Gate 5 persistence evidence (2026-11-14)

Test file: `packages/storage/test/gate5-persistence.test.ts`. Run: `npx vitest run test/gate5-persistence.test.ts` in `packages/storage`. Result: **35 of 35 pass**. Invented text only; no recordings, no device, runtime about 2.5 s.

## What is real in these tests

A "restart" is `library.close()` then `Library.open()` on the same folder, so the transcript is read from disk. The "final pass" is the real `Library.applyFinalPass` with final-pass segments that carry the same timings as the live text, with changed words ("jon smith" returns as "john smit"). No mocks.

## Scenario matrix (11 edit kinds x 3 states = 33 tests)

Edit kinds: word edit (typo); word edit marked remember; word edit revised twice; wider edit that absorbs a narrower one; revert correction; speaker rename; speaker merge; speaker split; speaker reassign; rename + reassign + merge combined; word edit + speaker rename combined.

States per kind: **applied**, **undone**, **undone then redone**. Each test checks:

1. After restart 1, the transcript file's raw bytes equal the bytes before the restart, and the parsed transcript equals the one returned when the edit was saved (corrections, speaker overrides, speaker names and merges, undo/redo history).
2. After a final pass on the reopened meeting, the user's state (corrections, speaker overrides, name/userNamed/mergedInto of every pre-existing speaker) is identical to before the pass. For applied and redone states, each active correction's replacement text is still shown. The pass adds its own model speakers; those are not user state and are excluded from the comparison.
3. After restart 2, the post-final-pass file reads back equal to what the pass returned, and the user state is still identical.

Plus 1 test: undo and redo still work, in order, after a restart and a final pass (a word edit and a speaker rename each undone and redone).

## False-replacement test (1 test)

A remembered correction ("pen" to "Penn" on one word) is applied, then the library is restarted and a final pass returns text with similar words ("pens", "pen", "pend"). Checks: the learned term is stored with its misheard form; "pens", the other "pen" and "pend" are unchanged in the displayed text; exactly one active correction exists.

**Finding:** the app has no automatic substitution. A learned term is only a recognition hint (`vocabularyHint`, "Never substitutes text") and a correction changes only the words the user selected. So a text-level false replacement cannot happen today, and this test guards that. It is **not** a measure of the plan's "fewer than 1 false replacement per audio hour".

## Not covered; Gate 5 still needs

- **Learned-term accuracy on real audio.** Stage 1 (`vocab-gate5-stage1-results-20261112.md`) found hints inert (output identical on and off, probably because of `-mc 0`) and did not pass. Recall improvement and false replacements per audio hour are unmeasured with an effective hint.
- Real Whisper final-pass output (timing drift, split or merged words, changed speaker labels) against corrections. These tests use final-pass segments with matching timings.
- A kill during a save (separate crash tests exist in `library.test.ts`), and the app-level path (IPC, UI) rather than the library.
- Windows. Run on the Mac only; the library code is the same, but there is no Windows evidence here.
- Corrections made while a final pass is running (one concurrency test exists in `library.test.ts`).

No product bug was found; no product code changed.
