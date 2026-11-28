### A-1139 — 2026-11-24 — Claude Code (Sonnet 5.5) / Mac — asked owner to toggle Microphone access; macOS relaunched Scribe on the owner's real library

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **What failed:** I asked the owner to switch Scribe off and on under Privacy > Microphone without warning that macOS offers "Quit & Reopen", which relaunches the app normally (no `--user-data-dir`, no isolated flag). The relaunched candidate opened `~/Documents/Meeting Scribe` (`index.sqlite` mtime 1795548432 -> 1795549094, file count unchanged at 7923, pid 42012, up about 90 s) until the owner quit it. My own `kill` was refused by the harness classifier, correctly.
- **Impact:** Library abort condition triggered; run stopped and rolled back to the original app. The owner's library was opened by the unreviewed candidate; no file added or removed, the index mtime changed.
- **Correction / remaining risk:** Rolled back (fingerprint equals `backup.sha`). The planner should check the owner's library is intact. Medium until checked. The run sheet should say: never toggle permissions while the isolated app is running; quit it first and relaunch with the `launch` command.
