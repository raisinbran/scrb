# Plan: transcript corrections and frozen spans

**Task:** ChatGPT work-split #1. **Status:** Approved by owner on 2026-10-30; code not started.
**Base:** `main` at `09ab9f52e3202e7c799c1d1cb3e9de26aab16c0a` (2026-10-30).
**Intended repo path:** `docs/plans/transcript-layers-and-frozen-spans.md`.
**Scope:** Correcting words and phrases, preserving original text/timing, freeze rules, undo/redo, and the UI/backend connection. Vocabulary learning and recognition bias are task #2, not implemented here.

## Existing foundation (reuse, do not rebuild)

- `packages/storage/src/formats/transcript.ts` already separates model words from user corrections, records originals and audio times, and stores undo/redo history.
- `packages/storage/src/corrections.ts` already validates contiguous same-track selections, handles overlapping corrections, prefers corrected text, freezes corrected spans during live/final replacements, and supports undo/redo. Storage tests cover several of these rules.
- `packages/storage/src/library.ts` locks per meeting, uses atomic transcript saves, handles concurrent final passes, and flags summaries outdated. `apps/desktop/src/main/meetings.ts` provides paged, correction-aware reads but does not yet register `applyCorrection`, `undo`, or `redo` handlers.
- The approved contract already specifies `WordRange`, `applyCorrection`, `undo`, `redo`, `getTranscript`, and `transcriptChanged`. **Do not alter `packages/contracts/` without separate owner approval.**

## Required behavior and implementation slices

1. **Keep the original as the source record.** Store corrections only in the separate layer. The display, search, summary, and export read the resolved corrected text. Each correction retains original model text, word IDs, track, speaker, and playable time. Model updates may adjust timing but never replace corrected words. Preserve permanent IDs whenever possible.
2. **Finish the backend bridge.** In `apps/desktop/src/main/`, register contract handlers for applying edits and undo/redo. Resolve the two `WordRange` endpoints against the *latest persisted* transcript into a contiguous same-track span, including a whole previously corrected phrase. Reject stale, missing, mixed-track, or partial-overlap ranges as `conflict` without changing the file. Use `Library` operations, not a renderer-side copy, and emit revisioned `transcriptChanged` changes after successful saves.
3. **Finish the editor in `apps/desktop/src/ui/`.** Select a word or phrase; show a small inline editor and the **Remember correction** option; keep the selection and typing stable while live text arrives. Style provisional, final and corrected text from backend-provided state. Wire Undo/Redo to the backend's returned `UndoState`; reload the relevant page after a missed transcript revision. Do not access storage modules from the UI.
4. **Keep saved corrections across every model pass.** Retain the current locked, atomic write path. Reuse and extend the frozen-span merge for final passes, live revisions, changed speaker labels, changed word counts, repeated passes, and edits arriving during finalization. If a live update cannot preserve the correction, reject that *update*, not the user's correction.
5. **Resolve history semantics before implementation.** `applyFinalPass` currently clears both undo and redo stacks (`corrections.ts`). This conflicts with the unqualified requirement that Undo/Redo work on all edits. **Recommendation:** preserve the user's ability to undo corrections after finalization by rebasing history onto surviving corrections/IDs, and explicitly test this. Do not simply remove the stack reset: speaker and word references may have changed. If safe rebasing is not feasible, return a narrowly scoped alternative to the owner for approval before changing behavior.

## Failure cases and proof tests

| Failure/risk | Required test and result |
| --- | --- |
| Crash or disk-write failure during an edit | Inject failures at temporary write, sync and rename; on reopening, either the previous complete transcript or the complete edit survives; no partial JSON or lost earlier correction. |
| Final pass races an edit | Apply edits immediately before and during finalization; after repeated final passes and restart, **100%** of accepted corrections still display with originals, stable IDs and valid audio times. |
| Live revision overlaps corrected text | Replace, split and merge provisional segments around a correction; the correction remains intact or the unsafe model update is dropped. The recording itself continues. |
| Selection is stale, crosses tracks or cuts a corrected span | Call the real backend handler with invalid `WordRange` endpoints and overlapping selections; return `conflict`, write nothing, and let the UI refresh without applying a different edit. |
| Re-edit, wider selection, or correction of a corrected phrase | Verify correct underlying word IDs are selected; edits to the exact span retain its original; wider corrections absorb earlier ones; Undo restores the earlier state. |
| Undo/redo lost across restart or final pass | Create edits, restart, undo, redo and finalize; verify the approved history policy, including a new edit clearing redo and no resurrection of obsolete speaker/word references. |
| Event lost while user edits a live transcript | Drop or reorder one `transcriptChanged` event, compare per-meeting revisions, reload a page, and verify no duplicate, stale, or missing displayed correction; the cursor does not jump. |
| User edit not reflected elsewhere | After edit, confirm persisted summary is marked outdated and search/export use corrected text. Do not overwrite a user-edited summary. |

Existing tests under `packages/storage/test/corrections.test.ts` and `packages/storage/test/library.test.ts` are the starting point. Extend rather than duplicate them. Add focused main-process handler tests and UI tests with invented transcripts; use AMI fixtures for evaluation. No real recordings, transcripts, participants' names or tokens.

## Dependencies and explicit boundaries

- **Task #2:** Vocabulary syncing must survive a crash between saving `transcript.json` and updating SQLite. `Library.changeTranscript()` currently saves first, then runs `syncVocabulary()`; task #2 must add an idempotent repair/reconciliation test so an edit is never lost and learning is not silently inconsistent. No vocabulary bias or blind text replacement belongs in task #1.
- **Task #5:** The contract exposes display text and a `correctionId`, not the original text; if the editor must show the original or offer direct Revert, propose the minimum contract addition for separate approval. Do not work around the contract in UI code.
- **Gates:** Build in the approved phase order. Claude Code reviews the change, runs `npm run check` and machine-specific checks, and records Gate 5 results. Gate 5 requires 100% correction preservation; false-replacement evaluation belongs to task #2.

## Owner decision (approved 2026-10-30)

**Approved:** Retain Undo/Redo of corrections after the final pass using safe history rebasing, consistent with V1. Speaker-history behavior still needs explicit implementation and testing. Any necessary contract addition requires separate approval.

**Review status:** Source and existing tests inspected on GitHub. This is a plan only: no code changed, no tests executed, and `npm run check` / `npm run test:smoke` were **not run**.
