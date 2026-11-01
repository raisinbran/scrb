# Cloud tasks — C1/C2/C3/C4/C5/C6 QA fixes handoff

**Date:** 2026-10-31 (America/Los_Angeles)  
**Repo:** `raisinbran/scrb`  
**Branch:** `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031`  
**Base:** `3c071b8a95fba3501904bf4d257a1982fbb7dac7`  
**Verified code head:** `6984d56e78bdf3011dad9c769cc9912630c188f9`  
**QA:** [Draft PR #8](https://github.com/raisinbran/scrb/pull/8). **Do not merge into or push to `main` without Claude QA and owner approval.**

This note supplements the [combined prior batch and continuation handoff](./2026-10-31-cloud-tasks-18-21-25-28-29-33-35-36-handoff.md). These are narrowly scoped QA defect repairs. No features were started, no live-transcript word logic was touched, and no `packages/contracts/` files changed (verified by comparing this branch against base).

## Defect commits, regression tests and boundaries

| Finding | Commit | Fix | Regression evidence |
| --- | --- | --- | --- |
| **C1 + C5** | `ee365fb9` | `printPdf` writes HTML to a uniquely named private temporary directory/file, calls Electron `loadFile` rather than a size-limited `data:` URL, sets `javascript: false`, and destroys the hidden window/removes scratch in `finally`. | `apps/desktop/src/main/exports.test.ts`: synthetic HTML over **2.6 MB**, mocked Electron load/print; checks content reaches print, scripts are disabled, file deleted and window destroyed after **success and print failure**. |
| **C2** | `72b1020b` | One shared `LargeModelGate` is provided to final-pass, import and summary jobs; a queued aborted job leaves the gate without starting. Starting a recording aborts/waits for an active summary, as for imports. Existing individual job serial limits remain. | `packages/app-core/src/large-model-gate.test.ts`: fake jobs for **all three pairs** (final/import, final/summary, import/summary), proving no overlap, plus queued cancellation. `apps/desktop/src/main/summaries.test.ts` added in `c0574834`: fake running summary aborts before recording, with no summary save. |
| **C3** | `f55595f9` | On startup, import staging scan/removal errors are logged as safe error name/code, rather than aborting library open. Each orphan folder is independent; unrelated folders remain untouched. | `apps/desktop/src/main/imports.test.ts`: synthetic EACCES on one UUID-named orphan; next orphan removed, startup returns successfully, log contains no private source path. |
| **C4** | `a3a054b6` | Use the same bounded, enabled-only `vocabularyHint` as final pass and forward it through the configured import runner into transcription. | `apps/desktop/src/main/imports.test.ts`: enabled invented term reaches fake import runner; disabled term is absent. |
| **C6** | `097a8978` | Translate `beginExport` `ACTIVE_MEETING` to contract `conflict` and `MEETING_NOT_FOUND` to `notFound`; use existing `meetingFolderName` sanitization plus UUID to name export files safely and uniquely from the meeting title. | `apps/desktop/src/main/exports.test.ts`: missing and busy meeting errors; safe title with forbidden characters; second export cannot overwrite first. |

**Follow-up commits:** `e8cebfd6` correct PDF option and optional cleanup test typing; `af9efbfd` rebuild malformed export test insertion without changing product code; `c0c3808a` CI-generated Prettier formatting; `c0574834` add summary cancellation regression; `0c6f0112` strict optional cleanup fixture type; `6984d56e` formatting-only follow-up. These are part of the same QA repair sequence; the five defect commits above remain the primary functional changes.

## Verified CI

**[GitHub Actions run #41270217347](https://github.com/raisinbran/scrb/actions/runs/41270217347)**, code commit **`6984d56e78bdf3011dad9c769cc9912630c188f9`**: **completed `success` on both Windows and macOS**. Each job passed:

- `npm ci`, changed-TypeScript Prettier, `npm run typecheck`, `npm run lint`, `npm run build -w @scrb/summary`
- `npm test`, `npm run check:boundaries`, `npm run build`, `npm run test:smoke`

Vitest: macOS **57 test files passed / 2 skipped**, Windows **53 passed / 6 skipped**. Earlier intermediate runs failed malformed test formatting or strict test typing; their causes were addressed in later commits before this successful run. The handoff document is a documentation-only commit after the verified code head; it changes no tested source.

## Exactly what was not run

- **Not run locally by ChatGPT:** direct Git clone, local `npm ci`, local Prettier/typecheck/lint/Vitest, or local Electron execution. GitHub Actions ran the named checks instead; no owner device was used.
- **Not run in actual Chromium:** an Electron `loadFile` print of a 2.56+ MB document or a genuine `ERR_INVALID_URL` repro. The 2.6 MB tests used a mocked BrowserWindow, exercising the proposed file load/cleanup path, not a physical Chromium renderer or PDF output inspection.
- **Not run using real models/capture:** overlapping Whisper/llama/FFmpeg jobs on GPU/CPU, process kill/hangs, actual recording-preempts-summary with microphone or live recording, import audio codecs/model accuracy, or installed Windows/macOS helpers. Concurrency tests used fabricated asynchronous runners.
- **Not run:** Windows AV/file locks during temporary-file cleanup, macOS filesystem permission/quarantine cases, real installed-app printing and DOCX/PDF parity, Native VoiceOver/Narrator, multi-hour recordings, real user meeting audio, or third-party model/binary license verification.
- **Not demonstrated:** an explicitly reverted/broken-code CI run proving red-before-green for each regression. New tests exercised the repaired behavior in the successful CI run; they were not separately run against deliberately reverted fixes.
- **Not changed:** `packages/contracts/`, the `LiveTranscriptSink` word issue, native capture code, installed packaging, owner files or `main`.

**Next:** Claude Code should inspect the five bounded fixes, run only the missing native/installed validation relevant to the current gate, and approve or identify reproducible defects. Keep PR #8 draft pending external QA/owner approval.
