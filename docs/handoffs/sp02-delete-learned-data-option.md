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

1. Under the meeting's lock, before anything is deleted, list the profiles whose only linked meeting is this one and the terms whose every example is from this one (hand-edited terms excluded).
2. Still under that lock, move the meeting folder away. If that fails, nothing learned is touched.
3. Delete the captured terms, then the meeting's index rows (which drops its links and its undo history).
4. Release the meeting lock. Then, taking only the global profile lock, remove each captured profile that no meeting links any more, through the normal profile delete (which unlinks saved transcripts). Lock order is therefore never meeting-then-global, matching profile matching, which takes the global lock first.

This is a best-effort order, not one atomic operation: the folder move, the SQLite writes and the transcript unlinking are separate steps, and a crash or power loss between them can leave some of the learned data in place or a delete half finished. The existing start-up recovery finishes an interrupted folder delete. If a requested profile removal fails, the delete result is not verified and its remaining list says "Voice profiles that could not be removed", so the dialog does not claim a clean delete.

Tests: a sole-source profile and term are removed; a profile shared with another recording is kept with only the deleted meeting unlinked; a term taught by two recordings is kept; with the box unticked nothing learned is removed; a delete racing a profile assignment that holds the global lock does not deadlock; a failed profile removal is reported.

## Kept items are not itemised

The approved result carries only counts removed. Items kept because another recording supports them are not listed or counted; the dialog says so in fixed wording. Itemising them would need another contract field, which is not approved.

## Settled by the owner, 2026-11-14

Decision: "only source" is the rule. The alternative, removing every profile or term the recording touched, would damage other recordings' speaker labels.
