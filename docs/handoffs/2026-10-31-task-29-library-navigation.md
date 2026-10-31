# Task 29 — search, open-folder safety and filter contract

**Base main:** 7790843. Real `searchMeetings` now uses `Library.search` (which reads corrected text from meeting files, not the index) and `openMeetingFolder`/`openLogsFolder` open only real paths inside the app-owned library. The main process passes Electron's `shell.openPath`; UI never receives paths.

**Known limitation:** current `SearchResult.matches[].segmentId` is null for text hits because `packages/storage/src/search.ts` returns time/speaker/snippet but not source segment IDs. Recommendation: add IDs to storage's `TranscriptHit` instead of deriving ambiguous IDs from overlapping two-track timestamps.

## Exact TypeScript contract proposal for search filter (not applied)

In `BackendCalls`:

```ts
searchMeetings: {
  request: { query: string; filter?: MeetingFilter };
  response: SearchResult[];
};
```

In `REQUEST_CHECKS`:

```ts
searchMeetings: shape(
  { query: text(MAX_NAME) },
  { filter: shape({}, { origin: oneOf('recorded', 'imported'), from: date, to: date }) },
),
```

The `CALL_TABLE`, preload/main IPC allowlists and events do not change. After approval, pass inclusive displayed-date bounds to `Library.search` and filter origin; avoid UTC midnight timezone conversions. Update mock and tests.

**Missing verification:** real Electron `shell.openPath` test, Windows junction and macOS symlink escape tests, index/title/date matching and timezone bounds. `npm run check`, smoke and native tests **not run**.