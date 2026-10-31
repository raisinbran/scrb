# Meeting Scribe — approved contracts and tasks 23, 26, 27 handoff

**Date:** 2026-10-31  
**Repository:** `raisinbran/scrb`  
**Working branch:** `rosmont/meeting-scribe-remaining-20261031`  
**Source baseline for this batch:** `0005c21b2beec13851f22bd60b7ce73a76937ee7` (Gate 2 follow-up head).  
**Never merged to `main`**; every changed file is on the isolated branch. Phase gates permit implementation here but still block main until Claude Code QA/owner gate approval.

## Commits by approved item

| Item | Commits | What is included |
| --- | --- | --- |
| Owner decisions | `0b2d416` | Recorded all six exact approvals in `2026-10-30-owner-decisions.md` and updated branch/gate policy |
| 9 — contract | `549ce5f`, `e5ab245`, `a8ed75f` | `transcriptionFailed` and sanitized failure text; verified on-disk `hasAudio`; `getUndoState`, guarded `retryFinalPass`, `meetingChanged`, import privacy flag; runtime validators, mock and tests. Real retry requires a configured final-pass queue and nonempty sealed chunks |
| 21 — contract | `0c79e57` | `listSpeakerSuggestions` request/check/mock/handler. Real returns an empty list because pending matching/suggestion storage is not implemented; never fabricate identity |
| 22 — contract | `45c045d` | `getPrivacyJurisdictions`: strict no-argument request, real editable library rule, sample mock and tests |
| 24 — contract | `a74d647`, `c4891f6`, `7c35489` | `getVocabularyUndoState`, `undoVocabulary`, `redoVocabulary`; real SQLite transactional term restore, guarded against concurrent change, bounded **in-memory** user-operation history, mock and tests |
| 25 — contract | `1ed5737`, `dd2a819` | Summary add/remove with strict discriminated request validators. UI cannot send an add ID/evidence; backend generates UUID and defaults `edited=true`, `alsoAtMs=[]`, `needsReview=false`; `sourceMs` required for all adds |
| 29 — contract | `7a291ab`, `cd2b37a` | Search filter shares `MeetingFilter` validator with list. Real storage filters source/date and returns source `segmentId`; mock mirrors filters |
| 23 — corrections | `13cb171` | Cross-segment corrected phrase retains its last selected word's end time; tests correction Undo/Redo through final pass and library restart |
| 26 — non-recovery | `efecb70` | Verified SQLite snapshot must match pre-upgrade table rows before migration. Synthetic mutation test. **No recovery implementation** |
| 27 — delete | `2082811` | Overlapping retention runs coalesce instead of deleting the same meeting twice; `close()` awaits in-flight sweep; synthetic test |

**Additional QA and integration commits:** `b601d2f` (canonical failure message + invented-data redaction test), `c01e138` (typed test assertion), `8f1cbaa` (unapproved-only proposals), `5c5b6ef` (exhaustive summary update branch), `4891861` (failed status label), `eea2b61` (no playback when `hasAudio=false`), `106a270` (failure detail and Retry transcription button), `bcf7bf8` (search segment ID/filter and final-pass retry tests), `36536a8` (exhaustive mock add branch), `c9c5ec3` (unique search hit keys).

## Implementation boundaries and open decisions

1. **Task 21:** the approved `listSpeakerSuggestions` *surface* works but returns no real pending suggestions until speaker matching storage is built. Profile rename/merge/delete still lack reversible library-level semantics. No identity guessing.
2. **Task 24:** vocabulary undo applies to user term edits/deletions in the current process only; it does **not** survive process restart. Reconciliation and auto-learn operations are not pushed into this history. **Recommendation:** decide if durable undo is actually required before approving a storage migration; don't revive deliberately deleted terms through a crash repair.
3. **Task 25:** existing summary generation is not a full completed model pipeline. Only add/remove behavior changed. Backend-generated IDs are not accepted from renderer; real summary must exist first.
4. **Task 9:** import is not fully wired into a real desktop handler, so the import privacy flag is exposed at contract/mock level, not demonstrated in a real import. Runtime retry of a final pass depends on configured tools and a readable sealed track. Real `hasAudio` currently detects `.opus` or `.opus.part` on owned tracks and can be false for an empty recording. Status `transcriptionFailed` is distinct from `ready`; external model text is not sent to UI.
5. **Task 23:** safe speaker-history rebasing across a final pass still needs stable speaker/override mapping. The existing correction-only preservation remains; don't silently re-enable stale speaker patches. The current `WordRange` contract cannot convey `expectedRevision` for a stale concurrent edit; propose a revision field separately if required.
6. **Task 26:** `docs/plans/index-recovery.md` is **not yet approved**. Do not implement snapshot restore/recovery or auto-delete forensic backups. Failed upgrades remain fail-closed until the owner approves an explicit recovery path.
7. **Task 27:** owner-confirmed deletion still means removal from owned app data, not physical erasure of user backups. The recovery snapshot and retained-copy rules remain untouched.
8. **New exact contracts are proposals only:** `docs/handoffs/2026-10-31-open-contract-proposals.md` gives complete TypeScript/recommendations for `listImports`, pause spans event, and global profile change Undo. Also a **schema proposal only** for per-correction vocabulary provenance. None of these changes was applied to `packages/contracts/`; their final policy remains with the owner. The profile-delete Undo proposal explicitly notes conflict with permanent embedding erasure.
9. **Privacy and security:** no Electron IPC channel or security settings changed. New approved calls/events are automatically included in the existing `CALL_NAMES`/`EVENT_NAMES` allowlists. Backend/main versus UI boundaries preserved.

## Review checks for primary agent

- **First:** execute `npm run check`, `npx prettier --check` on changed files, and `npm run test:smoke`; correct TS/lint/format/test failures before QA acceptance. These were **not run here**.
- Test all modified new call validators with extra keys/malformed IDs; exercise mock and real handlers. Test Task 9 `hasAudio` with and without sealed chunks, failed-pass retry with/without runner, and failure-message redaction.
- Confirm no unintended duplicate term/marker state on Task 24 Undo/Redo and after a later automatic correction update; decide durability separately.
- Verify Task 25 UUID/evidence in generated summary JSON and edit locks; test different item types plus removal of missing IDs.
- Verify Task 29 time bounds as inclusive displayed dates and a corrected phrase spanning segments; search results should jump to actual segment IDs.
- Verify Tasks 23/26/27 negative cases: cross-segment edit through finalization and reopen; mismatched-but-valid snapshot; overlapping retention operations. **Do not merge wholesale.**

## Exactly what was not run

In this session: **no `npm install`/`npm ci`, `npm run check`, TypeScript compiler, ESLint, Prettier, `npm run test:smoke`, Vitest suite, browser/Electron UI test, installed-app test, SQLite fixture tests, native Windows/macOS builds, model/transcription accuracy runs, device captures, privacy-permission tests, hardware/symlink/AV-lock tests, or 4/8-hour Gate runs were executed**. Added tests are written **but not executed**; no test-pass claim is made.

Reason: the code was read and committed through the connected GitHub integration because direct GitHub checkout from this runtime has previously failed DNS resolution; there is no locally checked-out project dependency tree. The older independent QA result (767 passed/24 skipped; 5 smoke passed/2 skipped) belongs to the earlier `042c326` branch, **not** this batch.

Only invented/synthetic test data was used; no user's recordings, transcriptions, names, credentials or model outputs were read. The primary agent decides all remaining unresolved items and merges accepted slices only after QA and the relevant owner gate.
