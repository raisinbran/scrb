# SP-02: delete asks whether to also remove learned data (contract change needed)

**Status:** owner approved 2026-11-14 (relayed by the planning session): both contract fields and the "only source" rule. Implemented in this PR: contract commit, backend commit, UI commit.

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

## Open question for the owner

Is "only source" the right rule? The alternative, removing every profile or term the recording touched, would damage other recordings' speaker labels.
