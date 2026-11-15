# Audit and plan: automatic Brief and Full summaries, exported like the transcript

**Status:** draft for owner approval, independent review pending. Audit and plan only, 2026-11-15, read against `main` at `f258188f`. Nothing was run. Owner feedback item 28. Supersedes the "State" table in `docs/plans/summaries.md` (written 2026-11-13).

**In plain words**

1. Since that plan, the real summary generator, Cancel and the safety rules have merged, so the app can write both summaries on a developer machine. A normal install cannot: the model and llama.cpp are not shipped or downloaded, and nothing generates automatically.
2. Summaries cannot be exported at all yet: the real export handler refuses everything but the transcript, though the layout code for summaries exists.
3. Five slices reach your intent; the two biggest unknowns are the model download size and how long a summary takes on a long meeting (about 15 minutes per meeting in the one test we ran).

## What is built and merged (checked in code today)

| Piece                                                             | State                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine `packages/summary`                                         | Built. Extraction, coverage pass, timestamp and quote checks, Brief and Full writing, llama.cpp server worker bound to 127.0.0.1.                                                                                                                                                                                                |
| Real `generateSummary`, `cancelSummary`                           | **Merged** (#185, `apps/desktop/src/main/summary.ts`). Runs through `LargeModelGate`, refuses and aborts when a recording is active ("recording always wins"), stale-transcript guard, link guard, both lengths in one run, progress events, server pid file for crash cleanup.                                                  |
| Summary storage, `getSummary`, `updateSummaryItem`, outdated flag | Built.                                                                                                                                                                                                                                                                                                                           |
| `summaryState` in the meeting list                                | Now read from `summary.json` (`readSummaryState`), no longer hard-coded.                                                                                                                                                                                                                                                         |
| Summary tab UI                                                    | Built; Generate button calls `generateSummary`.                                                                                                                                                                                                                                                                                  |
| Quality                                                           | Gate 6: recall 68% against a target of 80%, precision unknown until the hand check; the owner decides the target (`docs/gates/gate-6-summary-recall.md`).                                                                                                                                                                        |
| Export of summaries                                               | **Not wired.** `export.ts` throws "Summaries can't be exported yet" for `summary` and `both`. `packages/app-core/src/export-summary.ts` maps a stored summary to export types and `packages/export/src/layout.ts` already handles scope `summary` and `both` for DOCX and PDF. VTT is captions and has no meaning for a summary. |
| Where the model comes from                                        | **Missing for users.** `readSummaryPaths` reads `tools.llamaServer` and `models.summary` from the developer config file (`SCRB_FINAL_PASS_CONFIG`) only. `model-download.ts` has no summary model; `setup-status.ts` reports none; the packaged app ships no llama.cpp.                                                          |
| Automatic generation                                              | **Missing.** Only the Generate button starts a run.                                                                                                                                                                                                                                                                              |
| Re-processed warning (item 27)                                    | Separate UI and storage item, not part of this plan.                                                                                                                                                                                                                                                                             |

## What blocks the intent, smallest slices first

1. **Export of summaries (DOCX and PDF).** Remove the refusal for `summary` and `both` in `export.ts`, map the stored summary with `toExportSummary`, honour the Brief or Full choice and the options already in the dialog. VTT is disabled for Summary and Both in the dialog (Both with VTT would export only the transcript; owner decision below). Generated and edited items are exported as stored; an outdated summary exports with a visible "may be outdated" line. Depends on plan `export-native-save-dialog.md` only for where the file goes. No contract change. 6 to 8 hours. Can ship before the model work, since a user can already hold a developer-made summary.
2. **Ship llama.cpp and the model to users.** Add the llama.cpp build to the packaged Mac and Windows apps and add the summary model to the setup list and model download as an **optional** download (a missing summary model must not block setup, per requirement 8). The current choice is Qwen3.5-9B Q4_K_M (a 9B model; multi-gigabyte file, exact size and digest to be pinned from the model page in this slice, not guessed here). `ModelRole` already has `'summary'`, so no contract change. Windows needs the CUDA or CPU llama.cpp build choice. 14 to 20 hours, partly on packaging (`packaged-mac-app.md`, `packaged-windows-app.md`).
3. **Memory and the "never during a recording" rule on real hardware.** The rule is already enforced in code (the model run refuses and aborts while a recording is active, and the gate is shared with the final pass). What is unproven is memory next to the speech models: Gate 6 sampled peak llama-server memory at 1.9 to 6.2 GiB (the sampler may have missed the real peak). Measure on the 16 GB Mac and Regiurn (peak total memory with the summary model loaded, speech models unloaded or idle, the final pass not running at the same time), and set the fallback: smaller context (already one retry), then a failure message. No code expected unless numbers fail. 4 to 6 hours.
4. **Automatic generation after the final pass.** When a meeting's final pass finishes (status becomes ready) and the summary model is installed and no recording is active, queue one generation (both lengths). Setting `autoGenerateSummary`, default to be decided. If a recording starts, the run aborts and the meeting stays "not generated" with a note; it is not retried on its own while recording, and retries once when the app is next idle (not after a restart storm: once per meeting). A user edit never triggers it. Needs a settings field, which is a contract change (`AppSettings`, `SettingsPatch`), owner approval. 8 to 10 hours.
5. **Wire quality honesty.** Show the existing warnings on exports and add "Summaries are drafts; check action items" text decided by the owner. Small; folds into slice 1.

## Run time, memory, and long tests

- Observed: extraction 820 to 906 seconds for the three AMI meetings used, one at a time (Gate 6), and Brief plus Full writing about one more minute. A real one-hour meeting could take longer. Automatic generation therefore runs in the background after the final pass and must not delay export of the transcript.
- Because the model must not run during a recording, a summary of a meeting that ends just before the next one starts can wait, or be aborted and left for later.
- **Approval:** a three-meeting timing and memory run (slice 3) is about 45 minutes and exceeds 20, so it needs your explicit approval before it starts; the previous run overran the limit (incident A-353, A-399). Proposal: one meeting at a time, each run planned under 20 minutes, owner approves each, Regiurn preferred for heavy runs.

## Owner decisions required

1. Auto-generate after the final pass: **on or off by default**? Recommended **off** until the hand-checked precision is known and the first real use shows the time and memory are acceptable; the setting exists either way. On by default costs several GB of download and many minutes of CPU or GPU after every meeting.
2. Approve the settings contract change (`autoGenerateSummary`, and with it any "summary model" status fields) for slice 4.
3. Model: Qwen3.5-9B Q4_K_M as the single optional download, or a smaller model for 8 GB machines? (Gate 6 recall of 68% against 80% is also the owner's call: lower the target or try a larger model.)
4. Export formats: DOCX and PDF only for summaries (recommended). For "Both" with VTT: export only the transcript, or disable Both for VTT?
5. Approve the long timing and memory run, in the one-meeting-at-a-time form above.
6. Is a missing model on first use acceptable ("download the summary model, about N GB") or should setup offer it up front?

## Slices (one PR each)

1. Summary export (DOCX, PDF) in the real handler and dialog. No contract change.
2. Packaged llama.cpp and optional summary model download, setup status.
3. Memory and time measurement report (needs the long-run approval).
4. `autoGenerateSummary` setting and the post-final-pass trigger (contract approval).
5. Only if the measurements fail: a fallback or smaller model.

Slices 1 and 2 are independent and can run in parallel; slice 4 needs 2.
