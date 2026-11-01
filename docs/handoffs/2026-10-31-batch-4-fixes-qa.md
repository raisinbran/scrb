# Batch 4 fixes QA

**Reviewed:** `rosmont/meeting-scribe-remaining-20261031` at `a04c935` (code head `c182963`), against `330c9bb`.

**Recommendation: conditional pass.** D1 to D8 are fixed. Fix N1, then the batch is ready for the owner's gate decision. No product code was changed in this QA.

**Update, 2026-10-31:** N1 and N2 are done at `8424e07`, and CI passed there. The owner approved Batch 4 for `main`. N3 to N6 stay accepted or deferred as listed.

## Results

| #   | Result                             | Evidence                                                                                                                         |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Fixed                              | Both owner-rule outcomes work. All three real child-kill tests fail on the old code.                                             |
| D2  | Fixed                              | Both tests fail on the old code.                                                                                                 |
| D3  | Fixed, test too weak (N1)          | With a real hot journal on disk, the old check blocks with "attempt to write a readonly database"; the fix opens and rolls back. |
| D4  | Fixed                              | Undo and Redo tests fail on the old code. All three delete sites are covered.                                                    |
| D5  | Fixed on Mac (see N5)              | The test fails on the old code. Spans now use `ack.atNs`.                                                                        |
| D6  | Fixed                              | The test fails on the old code.                                                                                                  |
| D7  | Fixed (see N6)                     | The test fails on the old code.                                                                                                  |
| D8  | Fixed except 2 contract files (N2) | The nine other changed files match old content plus Prettier exactly, so they are formatting only.                               |

## New findings

| #   | Severity | Finding                                                                                                                                                                                                                               | Evidence                                                                | Blocks gate             | Action                                                                                  |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| N1  | Low      | The D3 regression test passes without the fix. Its transaction is too small to reach disk, so no hot journal exists.                                                                                                                  | `index-db.test.ts:364`. Passes with `verifyLive` reverted to read-only. | Yes, test only          | Make the child spill to disk and assert `index.sqlite-journal` exists before reopening. |
| N2  | Low      | Two contract files still fail Prettier, and CI excludes them.                                                                                                                                                                         | `meeting-filter.ts`, `meeting-filter.test.ts`                           | No                      | Owner approved formatting only, 2026-10-31.                                             |
| N3  | Low      | A kill between the snapshot rename and the hash save blocks permanently. Retry cannot clear it.                                                                                                                                       | `database.ts`, phase `copying` with a snapshot present. Reproduced.     | No                      | Data is safe. Accepted under "anything else stays blocked".                             |
| N4  | Low      | Two rarer dead ends: a kill between snapshot removal and journal removal in the re-upgrade path, and a kill between two migration steps on a multi-version upgrade.                                                                   | Reproduced.                                                             | No                      | Same as N3.                                                                             |
| N5  | Low      | After a worker restart on Windows, `atNs` restarts from 0, so later pause spans would be wrong. The helper ignores `clockOriginNs` and its ack sends `origin`. This is the gap already listed in `native/windows-capture/HANDOFF.md`. | `Session.cpp:389`                                                       | No, nothing reads spans | Fix before any UI uses spans. A pause between restart tries also records no span.       |
| N6  | Low      | The D7 hold runs new code on the old schema. Harmless now, because no later schema exists.                                                                                                                                            | `database.ts`, `upgrading && retainedSnapshot`                          | No                      | Recheck when the next migration is added.                                               |

An unlink failure in the re-upgrade path surfaces as the generic "could not be opened" message, but Retry still works, so it is not listed as a defect.

## What was run

- At `a04c935`: `npm run check` (829 passed, 24 skipped) and `npm run test:smoke` (5 passed, 2 skipped) on the owner's Mac.
- All new D1 to D7 tests against the old source, plus throwaway crash probes on real SQLite files, deleted afterward.
- GitHub reports CI run 41240713665 as completed successfully on `c182963`.

## Not run

Windows locally, built-app recovery dialogs, power loss, real antivirus or permission locks, real capture after D5, accessibility, and long runs. These are the same remaining native tests as `2026-10-31-batch-4-qa.md`. Tasks 20, 28, 32, 33 and 35 stay open.
