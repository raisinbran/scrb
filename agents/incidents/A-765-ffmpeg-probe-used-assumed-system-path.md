### A-765 — 2026-11-17 — Codex / MacBook Air M5 — optional AVFoundation listing probe used an absent fixed ffmpeg path

- **Status / attribution:** Confirmed avoidable command-path error; no product defect.
- **What failed:** An optional `ffmpeg -f avfoundation -list_devices` probe invoked `/usr/bin/ffmpeg`, which is not installed at that path. The app's ffmpeg is bundled inside Scribe.
- **Impact:** The optional probe did not execute. Host input and output devices were independently verified with Sound settings, system_profiler and CoreAudio, and Scribe's bundled helper was queried directly.
- **Correction / remaining risk:** No retry was needed because the direct CoreAudio and helper probes provide the requested comparison. Low.
