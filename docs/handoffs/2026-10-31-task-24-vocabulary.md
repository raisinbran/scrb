# Task 24 — vocabulary hints and term handlers

**Base main:** 7790843. **Implemented on branch:** real list/edit/delete term handlers, bounded enabled-term hint passed into final-pass recognition; no global text replacements. Import hints and live worker hints remain outstanding pending Tasks 17/18.

## Exact contract proposal for future Vocabulary undo (not applied)

Add type `VocabularyUndoState` in `types.ts`:

```ts
export interface VocabularyUndoState { canUndo: boolean; canRedo: boolean; }
```

Add calls in `BackendCalls`, `CALL_TABLE` and `REQUEST_CHECKS` respectively:

```ts
undoVocabulary: { request: void; response: VocabularyUndoState };
redoVocabulary: { request: void; response: VocabularyUndoState };
getVocabularyUndoState: { request: void; response: VocabularyUndoState };
```

```ts
undoVocabulary: true, redoVocabulary: true, getVocabularyUndoState: true,
```

```ts
undoVocabulary: nothing, redoVocabulary: nothing, getVocabularyUndoState: nothing,
```

Preload and main allowlists derive automatically from `CALL_NAMES`; add mock handlers/tests after exact TS approval.

## QA and outstanding

- Current `VocabularyTerm.history` is not a persisted audit trail; the current handler returns only a synthetic creation/last-update description, not every true action. Recommendation: add a **storage audit table** keyed by term ID before presenting detailed history. Do not claim full history.
- `vocabularyHint` is capped at 512 characters and 40 deduplicated enabled terms; the final-pass runner receives a stable string. The live worker and import runner are not yet wired.
- Confirm the installed whisper-cli accepts the hint, measure WER/false replacements with AMI+synthetic fixtures, and document negative-control audio hours. No automatic substitutions enabled.
- `npm run check`, unit tests, native recognition/accuracy runs **not run**.
