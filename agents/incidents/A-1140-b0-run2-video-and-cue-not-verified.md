### A-1140 — 2026-11-24 — Claude Code (Sonnet 5.5) / Mac — B0 run 2: screen video and read-aloud cue channel not tested before the main run

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **What failed:** I started the screen video with `screencapture -v -V 300` as a background step inside a watcher script without testing it first, and delivered the 10 "You" cues only through a notification and a terminal tab without confirming the owner could see them. No video file was produced, and the scripted Y lines are absent from the transcript (the mic track holds remote lines read about 8 s late; cause unproven).
- **Impact:** Cell 2 not measurable, Y voice missing in cells 1, 3 and 4, persistence not completed; part of the second 60-minute run's value lost. No product defect established.
- **Correction / remaining risk:** Evidence kept in `~/scrb-b0-20261124b`. A foreground `screencapture -v` works; test it and the cue display before starting a run. High for any rerun until the cue channel is proven visible.
