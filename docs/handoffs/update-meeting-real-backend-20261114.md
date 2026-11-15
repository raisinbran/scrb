# updateMeeting real backend (2026-11-14)

The real backend now handles `updateMeeting` (`apps/desktop/src/main/meetings.ts`). Title is trimmed and must be non-empty (contract validator caps it at 300). `startedAt` must be a valid ISO date-time (contract validator). Unknown id gives `notFound`. The meeting folder and audio never move: storage keeps the first folder name. Emits `meetingChanged`.

**Routing:** no change needed. `updateMeeting` is already in `MEETING_CALLS` in `apps/desktop/src/ui/lib/hybrid-backend.ts`, so it goes to the side that holds the meeting.

**Other real calls with no handler** (they return "This feature is not available yet."): see the PR description; not built here.
