# Task 21 — speaker handler additions and pending suggestion contract

**Base:** main 7790843. **Status:** profile list/rename/merge/delete and meeting speaker rename/merge connected to existing storage methods on the work branch; split and suggestion persistence remain outstanding.

## Exact TypeScript proposal (for later owner approval, not applied)

Add in `packages/contracts/src/backend.ts`:

```ts
export interface BackendCalls {
  // Insert in the Speakers section:
  listSpeakerSuggestions: {
    request: { meetingId?: MeetingId };
    response: SpeakerSuggestion[];
  };
}
```

Then add `listSpeakerSuggestions: true` to `CALL_TABLE`. Add to `packages/contracts/src/validate.ts` `REQUEST_CHECKS`:

```ts
listSpeakerSuggestions: shape({}, { meetingId: id }),
```

Both IPC allowlists already consume `CALL_NAMES`; add a mock handler in `apps/desktop/src/ui/mocks/mock-backend.ts` and success/rejection tests after approval. Do **not** invent a separate IPC channel.

## Outstanding decisions and tests

- Recommendation: persist pending suggestions keyed to meeting/speaker/profile and confidence; use the owner-approved threshold `0.60` only when the embedding model is available; never infer a speaker's identity from application/window titles.
- `splitSpeaker`: needs one atomic, undoable history entry for new speaker plus selected word override. Existing `Library.reassignSpeaker` provides the override but does not create a new speaker atomically. Implement in `packages/storage/src/corrections.ts`, not as two separate writes.
- Profile rename/merge/delete writes the SQLite store but cannot currently Undo. **Do not claim the per-assignment Undo requirement passed** until profile backup/undo semantics are approved and covered.
- Import never grows a voice profile unless the user explicitly enabled that import option.
- Verify main-process handler tests for real profile/meeting persistence and Undo. `npm run check`, real worker matching, macOS/Windows testing **not run**.
