# Contract proposals still awaiting exact-shape approval

**Status:** proposal only. These are **not** approved for edits to `packages/contracts/`; no runtime allowlists, mock handlers or migrations were changed for them. Intended base: `rosmont/meeting-scribe-remaining-20261031` after the approved Tasks 9/21/22/24/25/29 additions.

## A. List active imports (Task 18)

There is currently no durable import controller/list in the backend. Do not synthesize imported meetings from future progress events. Recommend a bounded list of *active* imports, with no raw source paths:

```ts
export interface ActiveImport {
  importId: ImportId;
  fileName: string;
  stage: ImportStage;
  fraction: number;
  cancelling: boolean;
}
// BackendCalls:
listImports: { request: void; response: ActiveImport[] };
// CALL_TABLE:
listImports: true,
// REQUEST_CHECKS:
listImports: nothing,
// MockBackend handler (after approval):
listImports: () => [...this.activeImports].map(/* active data, no paths */),
```

Do not persist tokens or list completed imports; `importFinished`, `importFailed` and `importCancelled` terminate a row. **Recommendation:** use the same in-memory import registry that emits progress, plus a mock fixture with two pending stages. If the UI needs import history after restart, request a separate decision.

## B. Confirmed pause-span event (Gate 2)

`recordingStateChanged` already signals pause state, but it cannot restore exact spans after missed events or a reload. Propose an event containing only confirmed gate transitions:

```ts
export interface ConfirmedPauseSpan {
  startMs: number;
  endMs: number | null; // null while the confirmed pause is still open
  reason: PauseReason;
}
export interface PauseSpansChanged {
  meetingId: MeetingId;
  revision: number; // monotone per meeting; missed revision triggers snapshot reload
  spans: ConfirmedPauseSpan[];
}
// BackendEvents:
pauseSpansChanged: PauseSpansChanged;
// EVENT_TABLE:
pauseSpansChanged: true,
```

No `REQUEST_CHECKS` entry is needed for an event. Update the event allowlist via `EVENT_NAMES` and the UI/mock subscriptions. **Recommendation:** emit only after both-track gate ACK verification and on successful Resume; one open span may have a null end. Include existing confirmed spans in a catch-up snapshot *only if* the owner approves a snapshot addition, rather than adding another IPC channel. Never label a failed pause as private/safe.

## C. Undo profile rename/merge/delete (Task 21)

Per-meeting correction `undo`/`redo` cannot undo a library-level voice-profile mutation. Suggested separate, global history controls:

```ts
export interface ProfileUndoState extends UndoState {
  nextUndo: 'rename' | 'merge' | 'delete' | null;
  nextRedo: 'rename' | 'merge' | 'delete' | null;
}
// BackendCalls:
getProfileUndoState: { request: void; response: ProfileUndoState };
undoProfileChange: { request: void; response: ProfileUndoState };
redoProfileChange: { request: void; response: ProfileUndoState };
// CALL_TABLE:
getProfileUndoState: true,
undoProfileChange: true,
redoProfileChange: true,
// REQUEST_CHECKS:
getProfileUndoState: nothing,
undoProfileChange: nothing,
redoProfileChange: nothing,
```

**Important unresolved privacy conflict:** permanently deleting a voice profile zeros embeddings. Undoing deletion would require retaining a recoverable embedding, contradicting permanent deletion unless the user explicitly chooses a temporary recovery window. **Recommendation:** permit rename/merge Undo via a bounded, transactional operation history; for profile delete, display the irreversible confirmation and make *speaker assignments* undoable by existing meeting history instead. If the owner requires delete Undo, approve a clearly advertised two-phase delete and expiration before implementing. Never quietly keep embedding backups.

## D. Vocabulary provenance — schema proposal only

The current SQLite vocabulary source links identify a correction, but do not record which specific misheard form each source supports. Undoing one correction can therefore remove a form still supported by another. Do **not** patch this with an in-memory rule.

**Proposed append-only migration 5→6** (requires schema/owner review):

```sql
CREATE TABLE vocabulary_misheard_sources (
  term_id TEXT NOT NULL REFERENCES vocabulary_terms(id) ON DELETE CASCADE,
  text TEXT NOT NULL COLLATE NOCASE,
  meeting_id TEXT NOT NULL,
  correction_id TEXT NOT NULL,
  PRIMARY KEY (term_id, text, correction_id)
) STRICT;
CREATE INDEX vocabulary_misheard_sources_correction
  ON vocabulary_misheard_sources(correction_id);
```

Explicit/manual misheard entries must remain independently owned (not falsely attributed to a correction), e.g. a separate manual-origin marker or its own source row. On migration, unknown legacy provenance stays **unknown** and never triggers deletion solely because one correction disappears. Reconciliation must be idempotent; undo removes only its own linked source, keeps any other supporting source, and respects user-deleted term suppression. Tests: two corrections support one form; undo either; user-manual form alongside learned; legacy version 5 data; deleted and disabled terms across reopen.

**Verification:** no TypeScript checks, migrations, mock tests or native code executed for these proposals.
