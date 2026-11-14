# SP-02: delete asks whether to also remove learned data (contract change needed)

**Status:** APPROVED by the owner on 2026-11-14 (relayed by the planning session). Approved scope, exactly: (1) optional `removeLearnedData?: boolean` on the `deleteMeeting` request; (2) optional `learnedDataRemoved?: { profiles: number; terms: number }` on `DeleteResult`; (3) the "only source" rule below. Nothing else in `packages/contracts/` is approved. Implemented in this PR as three commits: contract, backend, UI.

**Decision (owner):** deleting a recording asks "Also remove voice profiles and vocabulary learned from this recording?" The default is **keep**.

## Why the contract must change

`deleteMeeting` takes only `{ meetingId }` (`packages/contracts/src/backend.ts:210`, validated at `validate.ts:322`). Storage deletes the profile-to-meeting links and vocabulary contexts in the same call (`packages/storage/src/db/meetings-index.ts:108-119`). After it returns, nothing says which profiles or terms came from that recording. A follow-up `deleteProfile` call from the UI therefore cannot find them. The choice has to travel with the delete call itself.

## Exact change requested

1. `deleteMeeting` request: `{ meetingId: MeetingId; removeLearnedData?: boolean }`. Absent or `false` keeps today's behaviour (keep learned data).
2. `validate.ts`: `deleteMeeting: shape({ meetingId: id }, { removeLearnedData: bool })`, using whichever optional-boolean helper the file already has.
3. Optional, for the dialog wording: add `learnedDataRemoved?: { profiles: number; terms: number }` to `DeleteResult`. If this is not approved, the dialog uses fixed wording and the result stays as is.

Mock backend and the contract test list get the same field. Existing callers are unaffected.

## Planned work after approval

- Backend (`packages/storage` and `backend.ts`): when `removeLearnedData` is true, remove a profile only if this recording was its only source, and a vocabulary term only if its only context was this recording. For anything with other sources, keep it and say so in the result. A profile's embedding cannot be un-averaged, so a multi-recording profile is kept, not recomputed. Auto-delete keeps the default (keep).
- UI (`apps/desktop/src/ui/`): a checkbox in the delete dialog, unchecked by default, with a plain sentence saying learned names, voices and terms stay unless it is ticked.
- Tests for both sides, one commit per side.

## Ordering and provenance (as built)

The links that say where a profile or term came from (`voice_profile_meetings`, `vocabulary_contexts`) are deleted with the meeting's index rows, so the set to remove is captured first:

1. Before anything is deleted, under the meeting's lock, list the profiles whose only linked meeting is this one and the terms whose every example is from this one (hand-edited terms excluded).
2. Move the meeting folder away. If that fails, nothing is removed and learned data is untouched.
3. Delete the captured terms, then the meeting's index rows (which drops its links and its undo history).
4. Delete the captured profiles last, through the normal profile delete, which unlinks them from saved transcripts. A profile that cannot be removed (a meeting still busy) is kept and not counted.

This is ordered, not one database transaction: the folder move and the transcript unlinking are file operations a transaction cannot cover. A crash in between leaves learned data kept, never a meeting half-removed.

Tests: a sole-source profile and term are removed; a profile shared with another recording is kept with only the deleted meeting unlinked; a term taught by two recordings is kept; with the box unticked nothing learned is removed.

## Kept items are not itemised

The approved result carries only counts removed. Items kept because another recording supports them are not listed or counted; the dialog says so in fixed wording. Itemising them would need another contract field, which is not approved.

## Settled by the owner, 2026-11-14

Decision: "only source" is the rule. The alternative, removing every profile or term the recording touched, would damage other recordings' speaker labels.
