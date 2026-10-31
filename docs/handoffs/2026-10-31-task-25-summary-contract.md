# Task 25 — summary backend integration and contract

**Base main:** 7790843. **Implemented:** `getSummary` now loads the real `summary.json` via `Library.readSummary` and `toSummaryDoc`; `updateSummaryItem` persists through locked `Library.updateSummary` with `applySummaryUpdate`, which sets `edited:true`.

**Still outstanding:** `generateSummary` worker wiring, per-stage `summaryProgress`, summary-outdated event after transcript edits, bounded single-model ownership, and a reliable fake-model integration test. The current storage v2→v3 `upgradeDecision` already handles title case/unknown values correctly; add regression tests before altering it. Do not confuse absence of summary with a generated but empty summary.

## Exact TypeScript for approved-with-screen item add/remove (not applied)

Add to `SummaryItemUpdate` in `packages/contracts/src/types.ts` these variants after its existing four:

```ts
| {
    kind: 'add';
    collection: 'actionItems';
    item: ActionItem;
  }
| {
    kind: 'add';
    collection: 'decisions';
    item: DecisionItem;
  }
| {
    kind: 'add';
    collection: 'openQuestions';
    item: OpenQuestion;
  }
| {
    kind: 'remove';
    collection: 'actionItems' | 'decisions' | 'openQuestions';
    itemId: SummaryItemId;
  }
```

In `packages/contracts/src/validate.ts`, extend `summaryUpdate`'s `either(...)` alternatives with exact discriminated `shape` checks for each `add` item, and `shape({kind:oneOf('remove'),collection:oneOf(...),itemId:id})`; never use a broad `object` permissive validator. `CALL_TABLE` and `EVENT_TABLE` unchanged; these are variants of the existing `updateSummaryItem` call. Mirror in the mock and tests after primary-agent approval.

## Recommendations and verification

Do not add format-v4 impactBasis or project-impact items until their separately approved migration; keep `criticalDecisions` = all `decided` items. Preserve user-edited items when generating. Never store user transcript text in the index or error logs. No npm/type/lint/real model/smoke tests run.
