# UI: final-processing indicator (Recordings)

**Problem.** After Stop, a meeting shows "Final pass running". Opened, it holds the provisional live text and nothing says it will change.

**Contract check.** `MeetingStatus` has `finalPassRunning`; `meetingChanged` fires when it ends. There is no final-pass progress event or field (only import and summary progress). No contract change is made. A handoff note proposes one.

**Change (UI only, `apps/desktop/src/ui/screens/recordings/`).**
- `ProcessingBanner`: "Final transcript is still being processed; this text is provisional and will change", an indeterminate `<progress>`, and "about M:SS since recording stopped" (estimated from `startedAt + durationMs`, ticks each second).
- Library row: badge "Processing final transcript", hover hint and "Text will change".
- Refresh already exists: `meetingChanged` reloads the meeting, and the status change reloads the transcript (`useTranscript` reload key). The banner leaves when the status leaves. Opening is never blocked.

**Tests.** Banner shown, then gone after `finishFinalPass()`; row text. Mock backend unchanged (no contract change).

**Not verified.** Real final-pass end emitting `meetingChanged` in the packaged app; elapsed is an estimate and ignores pauses.
