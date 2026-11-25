### A-1153 — 2026-11-24 — Claude Code (Sonnet 5.5) / Windows — Windows B0: minor tool and script errors (grouped)

- **Agent:** Claude (Sonnet 5.5, Windows desktop app)
- **What failed:** (1) Wrong COM class id in my volume helper, fixed on the next call. (2) Assumed the bundled ffmpeg had `concat` and `volumedetect`; it has neither, so I wrote Node helpers. (3) Tried Playwright's Electron launcher on the installed app, which failed to start it; cause not established, so I used a remote debugging port instead. (4) A Node ESM import with a plain Windows path and a `process.argv[1]` check failed once each. (5) Used `Get-Process electron | Stop-Process` after the seeding run, which would also kill any other Electron process on the PC.
- **Impact:** A few minutes and some usage; no effect on results. Item 5 could have closed an unrelated app.
- **Correction / remaining risk:** Kill only the process I started. No other risk.
