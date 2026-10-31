# QA: Gate 2 follow-up and contracts batch (2026-10-31)

Reviewed `rosmont/meeting-scribe-remaining-20261031` at `9c71d51`. Fixes are on `qa/chatgpt-batch-3`.

## Result

`npm run check`: 800 passed, 24 skipped. Smoke: 5 passed, 2 skipped. Prettier clean on changed files. The branch as received failed type check and formatting, and one test failed.

The Mac helper now builds, and a 3-second `--mic-probe` run returned an ack and live `micLevel` events on real hardware. Not run: Windows build, 120-second timeout, permission-denied and device-loss cases, and installed-app tests.

## Fixed

| Bug                                                                                     | Effect                                                | Fix                                  | Test catches removal |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | -------------------- |
| A `to` date filter compared a bare day with a full timestamp                            | Search dropped every meeting on the last selected day | Compare at the bound's own precision | Yes                  |
| Two retry calls could both pass the status check                                        | The final pass ran twice                              | Retry-in-progress guard              | Yes                  |
| Vocabulary undo of a delete hit the unique term rule if the term had been learned again | Raw internal error                                    | Report `conflict`                    | Yes                  |
| A stale vocabulary undo entry stayed on top of the stack                                | Every older edit stayed blocked until restart         | Drop the stale entry                 | Yes                  |
| Missing separator in the headset hint                                                   | "Mic permission is offTesting"                        | Add it                               | No, text only        |

Also: type errors in `recording.ts` and `summary.test.ts`, repeated failure strings replaced by the exported constants, and a repeated busy check removed.

## Open

- **Date filter day:** list and search still use the UTC day, so a meeting near midnight can land on the wrong day. Decision: filters mean the user's local calendar day.
- **`meetingChanged`:** only retry emits it, and no screen listens. Screens still poll. It must fire on every status change.
- **Task 21:** `listSpeakerSuggestions` returns nothing until a suggestion store exists.
- **Tasks 23, 26, 27:** small slices were delivered, so each needs its remaining work checked against its plan.

## Decisions

- `listImports`: approved as proposed, in memory only.
- Pause spans: approved with changes. Drop `revision`, send the full span list in each event, and add `pauseSpans` to the recording snapshot for reloads.
- Profile undo: rename and merge approved, in memory. `nextUndo` and `nextRedo` drop `'delete'`. Profile delete stays permanent, behind a confirmation, because keeping embeddings would break permanent deletion.
- Vocabulary undo stays in memory for V1.
- Vocabulary provenance migration: approved as proposed.
- Index recovery: awaiting owner approval. Recommended first scope is a native startup dialog for cases A, B, C and E, with restore (case D) deferred.
