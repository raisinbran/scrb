### A-1138 — 2026-11-24 — Claude Code (Sonnet 5.5) / Mac — B0 preflight sound started before the owner pressed Start

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **What failed:** I started `afplay` of the preflight clip right after asking the owner to click Start, without waiting for the recording to begin; the first preflight therefore missed the start beep and the first remote speech.
- **Impact:** One preflight repeated (about 4 minutes of the 60-minute budget and extra owner time). The repeat used a watcher that starts playback only when a new meeting folder appears.
- **Correction / remaining risk:** Both preflight meetings kept in `$B0/evidence`. Low; the run sheet should state that playback starts only after recording is confirmed.
