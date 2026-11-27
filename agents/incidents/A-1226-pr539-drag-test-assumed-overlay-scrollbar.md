### A-1226 — 2026-11-27 — Claude (Sonnet 5.5, Mac desktop app) — Scrollbar drag test assumed macOS overlay scrollbars

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **What failed:** The first `transcript-scrollbar-drag` e2e computed the thumb position from an assumed 20 px thumb with no arrow buttons, and grabbed it 10 px below the track top. On Windows, classic scrollbars have arrow buttons, so the press landed on the up arrow and the Windows job failed with a 437 px offset.
- **Impact and evidence:** PR 539 run 46070709087, Windows job failed on both sizes while macOS passed; one CI round and one cross-session message wasted.
- **Correction / remaining risk:** The test now drags a plain scroller of the same box and height with the same pointer path and compares scroll fractions, so it needs no platform thumb geometry. Windows behaviour is still not verified locally. Medium.
