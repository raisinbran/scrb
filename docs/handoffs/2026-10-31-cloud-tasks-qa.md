# QA of ChatGPT's tasks 18, 21, 25, 28, 29, 33, 35 and 36 (2026-10-31)

**Reviewed:** `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031` at `d96cd33`, against its start `8424e07`. **Fixes:** branch `qa/cloud-tasks-batch`. This is still preliminary work for phases past Gate 2, so it stays off `main`.

## Fixed

| Task   | Bug                                                                                                                                                                            | Fix                                                                                                   | Evidence                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 28     | Any export failing before its first await, such as a summary export with no summary, left the meeting marked as exporting. Every later export of it was refused until restart. | The job starts only after it is tracked.                                                              | New test fails without the fix                                                     |
| 28     | PDF export failed on long meetings. Chromium refuses URLs over 2 MB, and the page was sent as a data URL.                                                                      | The page is a temporary file in the app's cache, deleted after printing.                              | Real Electron: 1.5 MB of HTML failed before. 6 and 12 MB printed after, repeatedly |
| 28     | The print page was described as script-disabled, but scripts ran.                                                                                                              | `javascript: false`.                                                                                  | Real Electron: a script ran before, did not after                                  |
| 28     | A busy or missing meeting reached the UI as "Something went wrong".                                                                                                            | Mapped to `conflict` and `notFound`.                                                                  | New test                                                                           |
| 18, 25 | Import, summary and final pass could load large models together, against the plan's one-large-model rule.                                                                      | One shared `ModelTurns` queue. A cancelled waiter leaves at once and cannot let the next job overlap. | New unit tests. The wiring in `backend.ts` has no test of its own                  |
| 18, 28 | After a crash, staged import audio stayed in the cache indefinitely.                                                                                                           | `cache/imports` and `cache/pdf` are cleared on open.                                                  | Not tested: no test covers `openBackend`                                           |
| 25     | Item extraction showed "Checking for missed items".                                                                                                                            | Reports `extracting`.                                                                                 | Reading only                                                                       |

## Checked, no bug

Import tokens and path handling, cancel and recording races, summary revision check, speaker and token mapping into summaries, `splitSpeaker` selection on one track, search prefilter, log redaction, Dialog focus, and the export deletion guard.

## Open decisions

1. **Summary and final pass during a recording.** The plan allows only live models then, but neither stops when a recording starts. The final-pass gap predates this work. **Recommendation:** settle both in task 17, when live models arrive.
2. **Import and summary in a packaged app.** Both are off behind environment settings until task 30.

## Not run

`npm run check`, the smoke test and 848 unit tests pass on Mac. Real import, summary model, DOCX and PDF parity with real meeting content, and native Windows runs were not done. The handoff's own "Still missing" column stands, and task 33's notices remain a release blocker.
