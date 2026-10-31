# Owner decisions after the contract fixes (2026-10-30)

All accepted by the owner on 2026-10-30.

1. `packages/contracts` is approved. Still to add with the capture work: a mic test and meters before Start.
2. Live delay: keep 5 s chunks for saved audio and send a separate live feed to the transcriber.
3. Auto-name line: 0.60. Below it the app suggests a name.
4. A recording that starts during an import stops the import, and the user retries it.
5. Final DER: keep the ~25% target. Check the ~8.5% hold-out result at the diarization gate.
6. Planner is replaced by written plans the owner approves (Development Process, "Risky-change plans").

## Capture and chunk plans

Every recommendation in `docs/plans/` is accepted, including the proposed contract additions, which are applied in the phase that needs them. Exceptions and notes:

- Mac signing: one stable self-signed certificate. Avoid the recurring $99 Apple Developer ID unless the app cannot work without it; if the upgrade test fails, look for a workaround first.
- Test hardware: the USB mic exists but is not available until Monday evening (2026-11-02). Run the USB case then.
- Gate 2 mic loss limit: at most 30 s per track over 8 hours, no single gap over 5 s, every gap marked.
- Crash loss: about 1 s for a program crash, about 5 s for a power cut, always marked.
- Whole-computer audio is never switched on automatically: warn and offer one click.

## Long-run tests

Most meetings run 0.5 to 2 hours and rarely over 4. Routine long runs are 4 hours, at Gates 2 and 3 and before maintenance releases. One 8-hour run per machine stays, before Gate 8. The drift target is under 50 ms over 4 hours. The app still supports 8 hours. Where the plans in `docs/plans/` say 8 hours for T15 or Gate 2, read 4 hours. The Gate 2 mic-loss limit scales the same way: at most 15 s per track over 4 hours, no single gap over 5 s, every gap marked.

## Plans from ChatGPT, approved 2026-10-31

- **Vocabulary:** only active remembered corrections influence recognition. Term edits, disables and deletes survive restarts. Hints come first, and automatic substitutions wait for passing evidence.
- **Index upgrades:** no automatic lossy rebuild of a damaged index. Upgrades use short-lived, verified snapshots, and leftover copies count in delete checks.
- **Delete:** "deleted" means removed from app-managed data, not physically erased, and the app says backups may still hold data. User-made copies are reported, not deleted.
- **Contract, approved now:** the failed status with its message, `retryFinalPass`, `meetingChanged`, `hasAudio`, `getUndoState`, and `privacyBannerRequired` on imports. Batch B items 1 to 6 and 8. Exact TypeScript shapes go to the owner before `packages/contracts/` changes.
- **Contract, approved with their screens:** pause spans event, `listImports`, summary add and remove, speaker suggestions, jurisdictions list, vocabulary undo, and the `searchMeetings` filter.
- **Contract, deferred:** model trial, profile rebuild and summary format v4. `criticalDecisions` keeps its meaning: all decisions marked decided.

## Exact contract approvals (2026-10-31 follow-up)

The owner approved direct implementation of these exact TypeScript shapes on the isolated working branch; Claude Code still QA-reviews them before any phase-gated merge to `main`:

- **Task 9:** `transcriptionFailed`, sanitized `transcriptionFailure`, `retryFinalPass`, `meetingChanged`, `MeetingDetail.hasAudio`, `getUndoState`, `importAudioFile.privacyBannerRequired`. Compute `hasAudio` from `audioDeletedAt === null` **and** the actual existence of owned audio. Place the picker-token comment directly on `PickedAudioFile.fileToken`. Update exhaustive status handling.
- **Task 21:** `listSpeakerSuggestions` as in `2026-10-31-task-21-speaker-contract.md`.
- **Task 22:** `getPrivacyJurisdictions` as in `2026-10-31-task-22-privacy-contract.md`.
- **Task 24:** `VocabularyUndoState` and `undoVocabulary`, `redoVocabulary`, `getVocabularyUndoState` as in `2026-10-31-task-24-vocabulary.md`.
- **Task 25:** add/remove summary updates. On add, the renderer sends item fields **excluding `id` and all `SummaryItemEvidence` fields**; backend generates the ID and evidence defaults; `sourceMs` is current transcript time or zero.
- **Task 29:** optional `MeetingFilter` on `searchMeetings`. Reuse a single runtime filter checker shared with `listMeetings` and retain source segment IDs for transcript search hits.

**Approved in principle, exact TypeScript still open:** `listImports`, a pause-span event, and profile rename/merge/delete undo. Draft for separate owner review; **do not apply**. Vocabulary-provenance schema changes remain proposals only.

**Branch policy:** phase gates no longer prevent development on this branch; `main` remains gated by Claude Code QA and gate approval. Security/IPC changes still require an owner-approved plan.

## Still needed

- QA, then owner approval, of `docs/plans/pause-resume.md`.
- The summary-to-export adapter is on `backend-export-adapter`. Its open gaps are in `2026-10-30-export-summary-gaps.md`.

## Commit history

On 2026-10-30 the owner had attribution trailers removed from all commits. That changed every commit ID, so IDs quoted in older notes and plans no longer exist. Find the commit by date and message.
