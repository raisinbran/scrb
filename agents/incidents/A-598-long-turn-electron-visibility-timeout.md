### A-598 — Electron long-turn visibility acceptance timed out

- **Status / attribution:** Confirmed test failure; exact application cause was not fully observable from the failed runner output.
- **What failed:** On the Windows CI smoke run for head `2c90261b4abe36000ec5aec182751f1a8dbd4288`, the 4h2m jump into the invented 420-word turn did not make the highlighted word fully visible within 5 s. The unit suite passed; no automatic rerun was made.
- **Agent-controlled cause:** The current implementation depended on the browser's scroll event to update React's virtualized window. This is a source-based likely contributor, not proven by the CI failure output.
- **Impact:** Exact-head Windows smoke failed at the acceptance visibility poll. No private data or Scribe session was involved.
- **Evidence:** GitHub Actions run `43921993931`, Windows job `133491394246`; local sanitized notes `/private/tmp/scrb-transcript-jump-evidence-20261116.md`.
- **Correction / prevention:** The jump handler now updates React's `scrollTop` state alongside the DOM property. A distant 420-word-turn component regression passes without a synthetic scroll event; a new exact-head CI run is required to verify the correction in Electron.
