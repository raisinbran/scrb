# Auto-generated meeting titles: handoff

No contract change and no new event. The title update reaches the meeting list through the existing `meetingChanged` event (the library change listener in `backend.ts`).

## How "not renamed by the user" is decided
`meeting.json` gains an optional `autoTitle: { kind: 'generated' | 'fallback', text }`. A meeting is titled only while it is `ready` and either still has the recording default title `Meeting` with no `autoTitle`, or carries its own earlier `fallback` title unchanged. Any other title, including one the user typed at start or changed later, is never touched. A `generated` title is final, so reruns and restarts leave it alone. No rename path has to set a flag.

## Open points for the owner
- The real `updateMeeting` handler (rename) is not in `apps/desktop/src/main` yet; the dialog's rename currently goes through the mock. Whoever adds it needs no extra step for titles to stay safe, but renaming a meeting back to exactly `Meeting` would make it eligible again.
- Imported meetings are not auto-titled (their title is the file name, and imports do not go through the final pass queue).
- Meetings finished before this change keep their titles; only new final passes (and "retry final pass") can title a meeting.
