# Cloud tasks QA

**Reviewed:** `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031` at `3c071b8`, against `8424e07`. Also N1 and N2 on `rosmont/meeting-scribe-remaining-20261031` at `8424e07`.

**Batch 4: pass.** N1 and N2 are fixed, so Batch 4 is ready for the owner's gate decision.

**Cloud tasks: fail for `main`, conditional for continued work.** The code is solid and the handoff is honest, but Tasks 18, 25 and 28 each have a defect to fix. No product code was changed in this QA.

## N1 and N2

- **N1:** the test now asserts a real journal on disk before reopening. The same scenario blocked on the old check in my earlier probe. I did not rerun this exact test against reverted code.
- **N2:** both contract files match the old content plus Prettier exactly, and CI no longer excludes them.

## Defects

| #   | Severity | Task   | Defect                                                                                                                                                                                                                  | Evidence                                                                                                                                                                                       | Blocks       | Smallest fix                                                                                                           |
| --- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| C1  | Medium   | 28     | PDF export fails once the document passes Chromium's 2 MB URL limit, because `printPdf` loads it as a `data:` URL.                                                                                                      | `exports.ts:35`. Real Electron: 1.71 MB printed, 2.56 MB gave `ERR_INVALID_URL`. The 8-hour transcript-only fixture is already 1.71 MB. Both-section exports and non-Latin text encode larger. | Task 28      | Write the HTML to a private temporary file, use `loadFile`, and always remove it.                                      |
| C2  | Medium   | 25, 18 | One large model at a time is not enforced. A summary checks only its own meeting, and imports ignore the final pass queue, so two large models can load together. Starting a recording does not stop a running summary. | `summaries.ts:67`, `imports.ts:105`, `recording.ts:186`. By reading. Requirements line 73 and 75, Task 25 ledger.                                                                              | Tasks 25, 18 | One shared gate around final pass, import and summary runs. Stop a summary at recording start, as imports already are. |
| C3  | Medium   | 18     | A failed cleanup of old import scratch folders stops the library opening.                                                                                                                                               | `imports.ts:68`, `:74`, `backend.ts` `await imports.recoverInterrupted()`. A locked folder rejects into the `openBackend` catch. By reading.                                                   | Task 18      | Catch and log per folder. Scratch must never block startup.                                                            |
| C4  | Low      | 18     | Imports ignore the user's vocabulary. The final pass passes `vocabularyHint`, and `importAudioFile` accepts one, but the runner does not.                                                                               | `final-pass.ts`, `createConfiguredImportRunner`. By reading.                                                                                                                                   | No           | Pass the hint, as `FinalPassQueue` does.                                                                               |
| C5  | Low      | 28     | The `printPdf` comment says "script-disabled", but JavaScript stays on. The document's CSP does block scripts.                                                                                                          | `exports.ts:23`                                                                                                                                                                                | No           | Set `javascript: false`.                                                                                               |
| C6  | Low      | 28     | A busy or missing meeting at export returns "Something went wrong", because `StorageError` is not mapped. Exported files are named `meeting-<uuid>`.                                                                    | `exports.ts:55`, `dispatch.ts:35`                                                                                                                                                              | No           | Map to `conflict` and `notFound`. Name the file from the meeting title with existing safe-name rules.                  |
| C7  | Low      | 17     | `LiveTranscriptSink` stores a whole utterance as one word, which would break word selection. It is not wired to anything yet.                                                                                           | `live-transcript.ts:85`                                                                                                                                                                        | No           | Fix when the real worker is wired, using its word timings.                                                             |

## Checked, no defect found

- **Contracts:** unchanged on this branch. New handlers use existing allowlisted calls.
- **Import:** one-use tokens, no source path sent to the UI, cancel and recording-preemption paths, and no ghost meeting on failure, by reading and test. Real FFmpeg was not run.
- **Summary:** a changed transcript refuses the save.
- **Export:** the deletion guard holds, and output is atomic. The hardened print window printed up to 1.71 MB.
- **Speaker split, search prefilter, log redaction, modal focus, model verifier:** read and tested, no defect.
- **Task 33:** still inventory only, as the handoff says. `getLicenses` stays empty.
- **Scope:** imports and summaries run only in unpackaged builds with a developer config, so no shipped path is affected.

## What was run

- At `3c071b8`: `npm run check` (848 passed, 24 skipped) and `npm run test:smoke` (5 passed, 2 skipped) on the owner's Mac.
- GitHub reports CI run 41266834780 as completed successfully on `c4bf129`, the last code commit.
- The real Electron PDF path with invented text at 0.11 to 6.82 MB. Above 1.71 MB, sizes were made by repeating the 8-hour fixture.

## Not run

Real FFmpeg imports, real llama-server summaries, DOCX and PDF opened in real viewers, Windows locally, screen readers, and every native test listed in the handoff. Tasks 14 to 17, 19, 20, 22, 24, 26, 27, 30 to 36 keep the status the handoff gives them.
