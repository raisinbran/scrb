# Known issues

Draft for the User Manual. Update it when the behavior changes.

## Microsoft Teams desktop app on Windows

**The issue.** Windows does not let any app record the new Teams desktop app by itself. Recording Teams on its own gives a silent meeting track, so the other people in the meeting are missing. This also affects other recording apps, including OBS.

**Current state.** Meeting Scribe does not have a fix for this yet. Until it does, pick **Whole computer audio** as the meeting app for Teams desktop meetings on Windows. Do not pick Microsoft Teams.

**What Whole computer audio records.** It records every sound your computer plays, not only Teams. Before you start, close or silence anything you do not want recorded, such as videos, music, notifications and other calls. Those sounds can appear in the transcript.

**Check before relying on it.** Watch the meeting level meter when someone else speaks. If it does not move, stop and check your setup. Your speakers or headset must be the default output, because Whole computer audio records only that device.

**Mac.** This issue applies to Windows only.
