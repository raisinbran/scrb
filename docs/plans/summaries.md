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

1. The model never runs while a recording is active. "Generate" is disabled during recording, and **starting a recording aborts a running summary** (the user is told, and reruns it). Recording must never wait on AI.
2. It runs through the existing `LargeModelGate` (one big model at a time, abortable), after the final pass, never beside it. The server starts for the job and stops when it ends (the worker already does this); the gate is released only after the process exits.
3. Context size stays at the worker default unless slice 1 shows a 16k context (about half the KV memory) gives the same results; then use it.

## 3. Pipeline in the app (what slice 1 wires)

1. `generateSummary` handler (new, `apps/desktop/src/main`): require a final transcript (meeting not recording or processing); read the **current corrected** transcript (includes corrections, speaker names and typed-note fills); map segments to engine lines `{startSec, speaker, text}`.
2. Run the engine inside the gate: `extractItems` once, then `writeSummary` for **both** lengths. This is one decision to confirm: both lengths cost about 1 extra minute (engine measure under load), and the toggle then never needs a rerun. The request's `length` only chooses which tab opens.
3. Map with `toGeneratedSummary`, save with `saveGeneratedSummary` (atomic; clears `outdated`; keeps edited items).
4. Emit `summaryProgress` (extracting, coverageCheck, writing, done/failed). `fraction` comes from sections done over sections total, which the engine's stats already count.
5. Meeting list and `meetingChanged` read the real `summaryState` from `summary.json` (replace the hard-coded value).

**Long meetings.** Already in the engine: 16k-character sections with overlap, coverage windows of 8k, one sampled retry then halving (twice) then a named warning for any lost time range; Brief and Full are written from the combined, deduped items plus one-line gists, never from the raw transcript. Extraction took 5 to 12 minutes under load on the evaluated machine (**not measured on the owner's Mac for a 60-minute meeting**; slice 1 measures it). "Checked against the source" today means each item's quote and timestamp are found in its section; a cross-section meaning check does not exist (README "Not done"), see risks.

**Prompt and output structure.** Unchanged: extracted items first (action, decision with status and impact, open question), then prose from those items only. Tables always full; unknown owner/deadline read "Not specified", unclear ones "Unconfirmed"; inferred impact is never shown as confirmed.

## 4. Timestamps link to the transcript

Each item carries the line it was read from. `sourceMs` is that line's start in the same clock as the transcript and playback, and `alsoAtMs` holds merged duplicates. The Summary tab's `TimeLink` seeks playback and scrolls the transcript. Two checks keep the "100% valid links" target:

- The engine already drops an item whose cited line does not exist or lacks supporting words, and flags repaired timestamps.
- Slice 1 adds one app-side test and runtime guard: every `sourceMs` falls inside the meeting duration and on a transcript segment; otherwise the item is kept but flagged `needsReview` (never a dead link).

## 5. Edits survive regeneration

Already: `edited: true` items and sections are kept by `mergeRegeneratedSummary`; `outdated` is set by transcript or speaker edits and shown as "May be outdated, regenerate?". Verified gaps, all inside `packages/storage` (no contract change):

1. **Duplicates.** `keepEdited` keeps an edited item and drops a fresh one only when both id and `sourceMs` match; the engine numbers ids per run and rewords, so a regenerated twin of an edited item usually appears beside it. Fix: match a fresh item to an edited one when `sourceMs` (or any `alsoAtMs`) is within a small window and the text is similar; the edited one wins. Tests with invented items.
2. **Deleted items return.** An item the user removed comes back on regeneration. Fix: keep a small `dismissed` list (kind, `sourceMs`, text hash) in `summary.json` (schema v4 with an upgrade from v3) and filter fresh items against it. V1-only.
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
- App wiring: handler tests against the fake llama-server (success, bad output, server down, abort, recording starts mid-run, final pass not done, gate shared with a final-pass job), plus `summaryState` in list and `meetingChanged`.
- Storage: merge tests for sections 5.1 and 5.2, v3 to v4 upgrade.
- Link validity: transcript segments map to `sourceMs` within bounds.
- Real-model checks (not CI): run `eval/run-batch.sh` on AMI fixtures only, one 60-minute-class AMI meeting for time and peak memory. **Any run expected to exceed 20 minutes needs owner approval first**, and the owner's real recordings are never read.
- Gate 6 evidence (recall, precision, link accuracy) is a separate, approved measurement after slice 3; the engine's own README numbers are not the gate.

## 10. Interaction with typed-notes fill (PR #131)

An accepted typed fill is an ordinary `applyCorrection`, so it flags the summary outdated and the next summary reads the corrected words. No other coupling. Do not generate a summary while the user is still reviewing fills.

## 11. Slice order

| # | Slice | Side | Size | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Real `generateSummary` on the dev build**: handler through `LargeModelGate`, config keys, mapping, progress, failure, real `summaryState`, quit cleanup; measure time and peak memory on one AMI meeting | Backend (`main`, `app-core`) | about 8-12 h | **First slice.** No contract change. Needs only the dev-assets files. M1-optional if the owner wants it early. |
| 2 | Regeneration safety: merge matching, `dismissed`, v4 upgrade, tests | Backend (`storage`) | about 4-6 h | Independent of slice 1 files. |
| 3 | Link guard, offline/loopback test, recording-aborts-summary rule, "May be outdated" end-to-end test on a real meeting | Backend (+ tiny UI text) | about 3-4 h | After 1. |
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

Pending (ChatGPT). Not approved. Do not start slice 1 until approved.
