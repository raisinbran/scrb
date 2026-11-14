# Known issues

Part of the [User Manual](README.md). Update it when the behavior changes.

## Microsoft Teams desktop app on Windows

**The issue.** Windows does not let any app record the new Teams desktop app by itself. This also affects other recording apps, including OBS.

**What Meeting Scribe does.** When you pick **Microsoft Teams (records all sound on its output device)**, the app records the speakers or headset Teams plays through, and follows Teams if it moves to another device.

**What this means for you.** Every sound on that device is recorded, not only Teams. Before you start, close or silence anything you do not want recorded, such as videos, music, notifications and other calls. Those sounds can appear in the transcript. Sound that other apps play on a different device is not recorded.

**Check before relying on it.** Watch the meeting level meter when someone else speaks. If it does not move, stop and check your setup.

**If the app warns you.** "Audio missing" with "the meeting track is silent" means the app you picked is playing sound that is not being recorded. Stop, pick **Whole computer audio**, and start again.

**Mac.** This issue applies to Windows only.
