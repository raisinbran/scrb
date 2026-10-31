# Plan: vocabulary rules and recognition hints

**Task:** ChatGPT work-split #2. **Status:** Approved by owner on 2026-10-31; code not started.
**Base:** `raisinbran/scrb` `main` commit `09ab9f52e3202e7c799c1d1cb3e9de26aab16c0a` (2026-10-30).
**Intended path:** `docs/plans/vocabulary-rules.md`.
**Scope:** Remembered corrections, editable terms and safe recognition hints. Task #1 owns frozen corrections; tasks #3 and #5 own proposed index/contract changes.

## Reuse and gaps

- `packages/storage/src/db/vocabulary.ts` already stores terms, misheard versions and correction references; `library.ts` syncs them on edit/undo/redo. **Risk:** `transcript.json` is saved before SQLite sync, so a crash can leave learning incomplete. Shared misheard forms can also be removed while another correction still supports them.
- `packages/transcription/src/whisper.ts` and `finalPass.ts` accept a final-pass hint, but `packages/app-core/src/final-pass.ts` does not pass one. Imports have a hint option; the live whisper-server path has none yet.
- The approved contract provides `listTerms`, `updateTerm` and `deleteTerm`; the main process has not wired these handlers. Contract history/context fields are not backed directly by the existing storage format.
- Gate 0's glossary improved recall on **20 invented terms with two synthetic voices**, but its single negative control does not establish a safe false-replacement rate.

## Behavior and implementation

1. **Keep learning tied to visible corrections.** Only *active*, `remember: true` corrections contribute to hints. Superseded/reverted corrections stay available for undo but do not influence future recognition. Preserve original words, timing and audio links. Multiple supporting corrections must not lose shared terms/forms when one is undone. Keep surrounding transcript context in the meeting folder, not SQLite.
2. **Make learning crash-recoverable.** Reconcile correction-derived links against readable meeting files on startup and after failed SQLite updates. The operation must be repeatable, preserve user-edited terms and enabled state, and never undo a saved correction. Warn that learning is pending when sync fails. If a meeting cannot be read, retain its existing references pending investigation. Any provenance/index migration needs separate task #3 approval.
3. **Respect deliberate vocabulary changes.** Edit, disable and delete must survive restart and reconciliation; deleting a term must not erase transcript corrections or silently resurrect the term. Define a durable deletion/suppression mechanism before implementation. A later explicit **Remember correction** may relearn it. Do not re-enable a disabled entry merely because another correction references it.
4. **Use bounded, local prompts.** Build deterministic, deduplicated hints from enabled terms, selecting relevant/recent entries within a measured model-specific length budget. Keep the hint stable for a transcription job. Connect final-pass and import paths. Verify the installed whisper-server accepts hints before modifying the live path; otherwise report that limitation. No network services or impact on audio capture.
5. **Avoid blind replacements.** Start with recognition hints, not global substitutions. An optional context-aware fixer must use strong evidence, keep original recognized words, remain reversible, and never overwrite frozen user corrections. Leave uncertain matches unchanged; enable no automatic fixer until it passes Gate 5 evaluation.
6. **Wire the UI through the contract.** Implement list/edit/disable/delete handlers and matching UI/mock tests without a renderer-to-storage import. Propose missing create/history/context capabilities in task #5 rather than changing `packages/contracts/` here or fabricating history.

## Failure tests and Gate 5

| Risk | Test and expected outcome |
| --- | --- |
| Crash between transcript and SQLite writes | Reopen/reconcile twice; correction remains saved, learning repaired once, no duplicate links. |
| Undo/redo, supersede, overlapping support | Only active remembered corrections affect hints; other supporting links and forms remain intact. |
| Disabled, edited or deleted entry | User choices persist through restart/rebuild; nothing deleted or disabled enters prompts without new explicit consent. |
| Unreadable/deleted meeting | No invented context; a failed read cannot remove evidence; confirmed deletion removes its references (task #4). |
| Overlong hints, similar terms, Unicode, worker failure | Stable prompt limits, no ambiguous replacements, no impact on saved audio or recording. |
| Final, import and live paths | Real worker interfaces tested with invented audio; unsupported live hinting documented, not guessed. |
| False substitutions | Compare hints off/on using synthetic terms and licensed AMI audio; count term recall, word error and false replacements per **audio hour**, including several hours of negative controls. |

**Gate 5:** All accepted user corrections survive restarts/final passes (**100%**, task #1); learned vocabulary improves recognition with **fewer than 1 false replacement per audio hour**. Synthetic Gate 0 results are not a pass. Claude Code validates tests and measures the installed app on the relevant machines before merge.

## Owner decisions (all three approved 2026-10-31)

1. Only active remembered corrections influence recognition; superseded entries remain undoable but inactive for hints.
2. Editing/disabling/deleting a term must survive reconciliation without rewriting its transcript correction; approve a durable provenance/suppression design, with any schema changes separately reviewed in task #3.
3. Enable prompts first; require passing false-replacement evidence before activating automatic context-aware substitutions.

**Not run:** No code changes, `npm run check`, unit/smoke tests, live model invocation, hardware checks or Gate 5 evaluation. Sources were inspected through GitHub at the named commit. No personal meeting data was used.
