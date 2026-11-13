# Plan: V1 meeting summaries

Status: **draft, independent review pending.** Docs only. No contract change is made here; one is proposed (section 8).

Requirement 8 and the completion criterion "generates Brief and Full summaries, each with complete action-item and decision tables linked to timestamps" are the target. Summaries are **not M1** (`docs/plans/m1-readiness.md`); everything below is V1 unless marked **M1-optional**.

## 1. What exists and what is missing (verified in code, 2026-11-13)

| Piece | State |
| --- | --- |
| Engine `packages/summary` | **Built.** Sectioned extraction with a JSON schema, coverage pass, timestamp and quote checks, dedupe, contradiction flags, Brief/Full prose written only from checked items, `transcriptHash`. Tested with a fake llama-server, unit tests and one recorded real run (`ES2016b.recording.json`); `npm test` needs no model. Needs `npm run build` in the package before `npm run check`. |
| Engine quality | Judged by one judge on six AMI meetings: 82% item recall (held-out 78%) with the coverage pass; held-out is about 2 points under the 80% line; precision about 16% non-items and 22% leftover repeats (`eval/judgments.md`). Gate 6 asks for recall and precision targets and 100% valid links, so it is not yet met. |
| Mapping to storage and contract | **Built.** `packages/app-core/src/summary.ts`: `toGeneratedSummary`, `toSummaryDoc`, `applySummaryUpdate`; tested in `summary.test.ts`. |
| Storage | **Built.** `summary.json` (schema v3) with brief/full bodies, tables, `outdated` flag, `saveGeneratedSummary` (merges edited items), `updateSummary`; a user edit to the transcript or speakers sets `outdated` and emits `summaryOutdated` (`meetings.ts:114-123`). |
| Real handlers | `getSummary`, `updateSummaryItem` real (`meetings.ts:753-780`). **`generateSummary` has no real handler**; the hybrid backend already routes it by meeting (`MEETING_CALLS`), so a real meeting gets "not available" today. |
| UI | `SummaryTab.tsx` is built against the contract: Brief/Full toggle, editable tables, `TimeLink`, progress, generating/ready/edited/outdated. Works on the mock only for generation. |
| List state | `summaryState` is hard-coded `'notGenerated'` for real meetings (`meetings.ts:184`, `backend.ts:57`). Missing. |
| Model and runtime wiring | **Missing.** `LlamaServerWorker` exists but nothing in `apps/desktop/src/main` starts it. The model and a llama.cpp build exist only as dev assets (`scripts/dev-assets.sh`, `third_party/MANIFEST.md`). `setup-status.ts` reports no `summary` model. `startModelDownload` is mock. |
| Export | `packages/app-core/src/export-summary.ts` exists; real `exportMeeting` is a separate M1 task. Not in scope here. |

## 2. Model and runtime (decision)

**Keep what the engine was tuned and judged on: llama.cpp `llama-server` with Qwen3.5-9B Q4_K_M, Metal, local only.** It is already in the manifest (MIT runtime; model listed as Apache-2.0, pinned HF revision and SHA-256 in `dev-assets.sh`), the file on disk is 5.68 GB (measured), and every quality number in the repo belongs to it. A smaller or different model would restart the evaluation, so it is the cheapest option only if it measures as accurate: Ministral-3-8B (5.2 GB) and granite-4.2-8b (5.3 GB) are already downloaded as Phase 0 comparison candidates, but their results are not in this repo's judgments, so any claim about them is **unverified**. No change unless slice 1 shows a memory problem.

Memory (owner's Mac: Apple M5, 16 GB; this repo's own measure): the worker comment says about 8 GB with its 24k-token context and q8 KV cache; that figure is **unverified on the M5**, so slice 1 records peak resident memory.

Rules that follow from it:

1. The model never runs while a recording is active, and this is **part of slice 1**, not a later guard. The handler gets the recording controller's state from `backend.ts` (the same state behind `getRecordingSnapshot`) and: refuses to start unless it is `idle`; re-checks after the wait for the gate and before saving; and aborts the run (an `AbortController` passed to `LargeModelGate.run` and the worker, which stops the server) the moment `recordingStateChanged` leaves `idle`. The user sees "Summary stopped because a recording started. Run it again after." (stage `failed`; previous summary untouched). Recording must never wait on AI.
2. It runs through the existing `LargeModelGate` (one big model at a time, abortable), after the final pass, never beside it. The server starts for the job and stops when it ends (the worker already does this); the gate is released only after the process exits.
3. Context size stays at the worker default unless slice 1 shows a 16k context (about half the KV memory) gives the same results; then use it.

## 3. Pipeline in the app (what slice 1 wires)

1. `generateSummary` handler (new, `apps/desktop/src/main`): require a final transcript (meeting not recording or processing, and no recording active, section 2); read the **current corrected** transcript (includes corrections, speaker names and typed-note fills) and **remember its `revision`**; map segments to engine lines `{startSec, speaker, text}`.
2. Run the engine inside the gate: `extractItems` once, then `writeSummary` for **both** lengths. This is one decision to confirm: both lengths cost about 1 extra minute (engine measure under load), and the toggle then never needs a rerun. The request's `length` only chooses which tab opens.
3. Map with `toGeneratedSummary`, save with `saveGeneratedSummary` (atomic; clears `outdated`; keeps edited items). **Stale guard (verified gap):** today `saveGeneratedSummary` stamps `transcriptRevision` from the transcript as read *at save time* and sets `outdated: false`, and an edit made during a first generation flags nothing because no `summary.json` exists yet. So a summary of old text could be saved as current. Fix in `packages/storage` (no contract change): the call takes the revision read in step 1 and, under the same meeting lock, compares it with the current one. If they differ the summary is **not saved**; the run ends `failed` with "The transcript changed while the summary ran. Run it again." and any earlier summary stays (and stays flagged outdated). Any revision change counts, including a final-pass relink, because the text the summary read is no longer the text shown. Tested with a transcript edit between read and save, for a first summary and a regeneration.
4. Emit `summaryProgress` (extracting, coverageCheck, writing, done/failed). `fraction` comes from sections done over sections total, which the engine's stats already count.
5. Meeting list and `meetingChanged` read the real `summaryState` from `summary.json` (replace the hard-coded value).

**Long meetings.** Already in the engine: 16k-character sections with overlap, coverage windows of 8k, one sampled retry then halving (twice) then a named warning for any lost time range; Brief and Full are written from the combined, deduped items plus one-line gists, never from the raw transcript. Extraction took 5 to 12 minutes under load on the evaluated machine (**not measured on the owner's Mac for a 60-minute meeting**; slice 1 measures it). "Checked against the source" today means each item's quote and timestamp are found in its section; a cross-section meaning check does not exist (README "Not done"), see risks.

**Prompt and output structure.** Unchanged: extracted items first (action, decision with status and impact, open question), then prose from those items only. Tables always full; unknown owner/deadline read "Not specified", unclear ones "Unconfirmed"; inferred impact is never shown as confirmed.

## 4. Timestamps link to the transcript

Each item carries the line it was read from. `sourceMs` is that line's start in the same clock as the transcript and playback, and `alsoAtMs` holds merged duplicates. The Summary tab's `TimeLink` seeks playback and scrolls the transcript. Two checks keep the "100% valid links" target:

- The engine already drops an item whose cited line does not exist or lacks supporting words, and flags repaired timestamps.
- Slice 1 adds an app-side guard before saving (mapping step, `app-core`), so **no saved link is ever dead**: every `sourceMs` and every `alsoAtMs` entry must fall inside a transcript segment of the meeting. One that lies inside the meeting but between segments is remapped to the nearest segment start within a few seconds and the item gets `needsReview`. Otherwise an `alsoAtMs` entry is removed, and an item whose own `sourceMs` is invalid is **dropped**, with a warning in `warnings` ("N items were left out because their place in the recording could not be found"). Open questions with a null `sourceMs` are allowed. User-added items go through the same check in `applySummaryUpdate`, which rejects an out-of-range time. Tests with invented transcripts for each case.

## 5. Edits survive regeneration

Already: `edited: true` items and sections are kept by `mergeRegeneratedSummary`; `outdated` is set by transcript or speaker edits and shown as "May be outdated, regenerate?". Verified gaps, all inside `packages/storage` (no contract change):

Both fixes below use one pairing rule, **evidence first, then a content-word check**, so wording may change but two different items from one segment are never confused.

**Item key.** For each item: its kind; the transcript segments it cites (the segment containing `sourceMs` and each `alsoAtMs`); and a token set built from its main text (action: action plus owner; decision: decision; question: question). Tokens are lower-cased words with punctuation and a fixed English stop-word list removed and a trailing `s`, `es`, `ed` or `ing` stripped, keeping at most 12. A dismissed record stores this key (kind, segment time ranges, tokens), never the full text.

**Match rule** between a stored key (edited item or dismissed record) and a fresh item:
- (a) Same kind and at least one shared cited segment. Otherwise no match.
- (b) Score = shared tokens / the smaller of the two token sets. The pair is a match at **score of at least 0.5** (both sets have at least 3 tokens; with fewer, the sets must be equal).
- (c) Pairing is one-to-one: take all matching pairs, best score first, and assign each stored key and each fresh item at most once. A fresh item that is not assigned stays as a normal new item.
- (d) **Ambiguity never loses data:** if a stored key's best and second-best fresh candidates are within 0.15 of each other, or a fresh item matches two stored keys within 0.15, that pairing is not made. The result is then one extra visible item (an edited item shown beside a fresh twin, or a deleted item shown again), never a hidden or overwritten one.

1. **Duplicates.** `keepEdited` keeps an edited item and drops a fresh one only when both id and `sourceMs` match; the engine numbers ids per run and rewords, so a regenerated twin of an edited item usually appears beside it. Fix: a fresh item paired with an edited one by the match rule is dropped; the edited one wins.
2. **Deleted items return.** An item the user removed comes back on regeneration. Fix: when the user removes an item, store a `dismissed` record (the item key above) in `summary.json`, schema v4 with an upgrade from v3. A fresh item paired with a dismissed record by the match rule is filtered out. Not matched, for example because the segment no longer exists after a re-run or the paraphrase shares under half its content words, means the item may reappear; that is accepted and shown as a normal new item the user can delete again. V1-only.

Tests (invented items, `packages/storage`):
- Two actions from one segment ("Priya sends the budget estimate", "Sam books the review room"); the user deletes the second; regeneration returns paraphrases ("Book a room for the review, Sam" and "Priya to send an estimate of the budget") in either order: the Sam item is filtered, the Priya item stays.
- The same two, both deleted: neither returns. Neither deleted: both stay.
- Same setup, user edits the first instead: the edited item stays and its paraphrased twin is dropped; the other action is untouched.
- A paraphrase sharing fewer than half its tokens returns as a new item (documented limit).
- Ambiguous case: two near-identical fresh items for one dismissed record are both shown.
- A dismissed segment that no longer exists; a v3 file upgrades to v4 with no dismissed records.
3. **Hand-added items** (`kind: 'add'`) are created `edited: true` today, so they are already kept.
4. Narrative: an edited section is kept only if its slot has the same id and heading; otherwise it is appended after the new text, so nothing the user wrote is lost. The UI should say "Your edited text is kept" (UI note, no contract change).

A failed or cancelled run never touches `summary.json`.

## 6. Failure, cancel, offline and privacy

- **Failure:** stage `failed` with a plain message; the previous summary stays. Causes handled: model or llama.cpp missing (message names which, and that audio and transcript are safe), server will not start, out of memory (retry once with the smaller context), timeout, bad output (engine already retries then warns). Partial coverage shows `warnings` always, as the contract requires.
- **Cancel:** the contract has **no `cancelSummary`**. Today only recording-start, delete-meeting or app quit can stop a run. A real Cancel button needs a new call (section 8). Closing the app kills the child server (verified in slice 1 with a test that fails if a `llama-server` process is left after quit; add a stale-process cleanup at startup).
- **Offline and private:** after the one-time model download no network is used. The server binds `127.0.0.1` only on a random port (already in `worker.ts`); no telemetry flags; transcript text is passed only over that loopback socket and never logged (the logger already redacts `summary` and `transcript` fields). Slice 1 adds a test that the spawned arguments contain the loopback host and nothing remote, and the existing privacy checks (`app-core/src/privacy.test.ts`) stay green.
- **Deleting a meeting** deletes `summary.json` with the folder (already part of delete verification).

## 7. Model download (V1-only; M1-optional: dev build keeps the config-file paths)

- Add `summary` to the setup status as an **optional** model: a missing summary model must not block `complete`, because summaries are optional (requirement 8).
- The dev/config route comes first (config `models.summary` and `tools.llamaServer`, in the same files the final pass uses; exact key names set in slice 1).
- The real download (`startModelDownload`, `modelDownloadProgress`, `checkModelUpdates`, `revertModel`) belongs to the packaged-app and setup work; this plan only requires that it fetch the pinned file with the pinned SHA-256 from `dev-assets.sh`, verify before use, resume or restart cleanly, and delete a partial file on failure. It is the one place the app touches the network, and it must say so on screen. Packaged llama.cpp must be the pinned build, shipped per `docs/plans/packaged-mac-app.md`.
- License text for the model and llama.cpp goes into the third-party notices (Apache-2.0 and MIT as the manifest lists them; **verify the model card at ship time**).

## 8. Contract

Needed: **`cancelSummary: { request: { meetingId }; response: void }`**, a call, plus its names added to the preload/main allowlists. Nothing else: `generateSummary`, `getSummary`, `updateSummaryItem`, `summaryProgress`, `summaryOutdated` and `ModelRole: 'summary'` already cover the rest. If the owner declines, slices 1 to 3 still ship without a Cancel button. A handoff note is at `docs/handoffs/2026-11-13-cancel-summary-contract.md` for owner approval; `packages/contracts/` is untouched.

## 9. Tests (invented data or AMI only)

- Engine: existing suite (fake server and recording) stays; add no new model run in `npm run check`.
- App wiring: handler tests against the fake llama-server (success, bad output, server down, abort, recording active at start, recording starts while waiting for the gate and mid-run, final pass not done, gate shared with a final-pass job), transcript edited between read and save (not saved, earlier summary kept), invalid `sourceMs`/`alsoAtMs` (remapped or dropped), plus `summaryState` in list and `meetingChanged`.
- Storage: merge tests for sections 5.1 and 5.2, v3 to v4 upgrade.
- Link validity: transcript segments map to `sourceMs` within bounds.
- Real-model checks (not CI): run `eval/run-batch.sh` on AMI fixtures only, one 60-minute-class AMI meeting for time and peak memory. **Any run expected to exceed 20 minutes needs owner approval first**, and the owner's real recordings are never read.
- Gate 6 evidence (recall, precision, link accuracy) is a separate, approved measurement after slice 3; the engine's own README numbers are not the gate.

## 10. Interaction with typed-notes fill (PR #131)

An accepted typed fill is an ordinary `applyCorrection`, so it flags the summary outdated and the next summary reads the corrected words. No other coupling. Do not generate a summary while the user is still reviewing fills.

## 11. Slice order

| # | Slice | Side | Size | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Real `generateSummary` on the dev build**: handler through `LargeModelGate`, config keys, mapping, progress, failure, real `summaryState`, quit cleanup; **plus the safety rules that make it safe to turn on**: recording checks and abort (section 2), the stale-transcript guard (section 3 step 3, small `storage` change) and the link guard (section 4); measure time and peak memory on one AMI meeting | Backend (`main`, `app-core`, small `storage`) | about 12-16 h | **First slice.** No contract change. Needs only the dev-assets files. M1-optional if the owner wants it early. Generation is not enabled for anyone before all of these are in. |
| 2 | Regeneration safety: evidence matching, `dismissed`, v4 upgrade, tests | Backend (`storage`) | about 4-6 h | Independent of slice 1 files (slice 1's storage change is only the save-time revision check). |
| 3 | Offline/loopback test, "May be outdated" end-to-end test on a real meeting | Backend (+ tiny UI text) | about 2-3 h | After 1. |
| 4 | `cancelSummary` (contract, handler, button) | Contract + both | about 3 h | Only after owner approval. |
| 5 | Optional summary model in setup status and the real download, shipped llama.cpp | Backend | with packaged-app work | V1-only. |
| 6 | Quality work toward Gate 6 (precision, cross-section check, model comparison) | Backend | open | Only if the measured Gate 6 run misses the target. |

Estimates are rough; the owner's Mac has not run the full pipeline yet.

## 12. Risks

| Risk | Handling |
| --- | --- |
| Quality under the 80% line and 16% non-items | Table is editable, items link to source and can be flagged `needsReview`; measure before claiming Gate 6. |
| 60-minute meeting takes many minutes or runs out of memory on 16 GB | Slice 1 measures; abort-on-record and one-big-model-at-a-time rules; smaller context fallback. |
| Orphaned `llama-server` holds 8 GB after a crash | Kill on quit, stale-process check at start, test. |
| Edit merge hides a real change | Edited item wins, fresh twin dropped only on close timestamp and similar text; dismissed list can be cleared by the user. |
| Later reversals sit beside the first version | Known engine gap; contradictions are flagged for review, not resolved. |
| Gate wait: summary queued behind a long final pass | The UI shows "Waiting for transcription" using the existing state; no new contract needed. |

## Independent review

Round 1 (ChatGPT) rejected the first draft with four blockers: dead links kept with a flag, recording abort deferred, stale summary saved as current, text-hash tombstones. All four are revised (sections 2, 3, 4, 5, slice table). Round 2: three resolved; the fourth (two items from one segment) is now answered by an item key and an exact pairing rule in section 5. Round 3 pending. Not approved; do not start slice 1 until approved.
