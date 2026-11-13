# Handoff: a way to cancel a summary (contract change, needs owner approval)

From the summaries plan (`docs/plans/summaries.md`, section 8). Nothing in `packages/contracts/` is changed.

**Gap.** The contract has `generateSummary` and `summaryProgress`, but no way to stop a running summary. A run takes minutes and holds about 8 GB, so the user needs a Cancel button.

**Proposed addition (one call, no new type):**

```ts
cancelSummary: { request: { meetingId: MeetingId }; response: void };
```

Same rule as `cancelImport`: cancelling a run that already ended, or twice, does nothing. A cancelled run emits `summaryProgress` with `stage: 'failed'` and the message "Summary cancelled." and leaves the previous `summary.json` untouched. The name also goes in the preload and main allowlists, the validators and the mock backend.

**If declined:** summaries still work; a run stops only when a recording starts, the meeting is deleted or the app quits.
