# Task 20 transcript UI: handoff

Branch `rosmont/phase3-transcript-ui-20261101`. UI only; no backend or contract changes. Tested on the mock backend with invented data, including 4,800-row (8-hour) transcripts.

## What the UI now relies on

- `getTranscript` must reflect a revision before `transcriptChanged` announces it. The transcript store refetches a dropped page only when an event lands during the fetch, so a backend that announces first could leave rows on "Loading…" until the next event.
- `meetingChanged` must fire when the final pass ends or fails. The Live notice after Stop follows it.
- `transcriptionLag` with `lagMs` under 1000 shows "Transcript: catching up".

## Not done here

The real live worker is not wired, so the real app still shows "Transcript: off" and no live words. That remains the backend owner's task; the UI claims nothing about it.
