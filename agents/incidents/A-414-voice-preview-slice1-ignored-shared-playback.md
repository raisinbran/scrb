### A-414 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — slice 1 voice preview built without the shared player's interaction
- **Status / attribution:** Confirmed agent error. Caught by independent review of PR #299 before merge and fixed in the same PR. No product defect shipped.
- **What failed:** The first version of the Split a speaker preview borrowed the backend's single playback session but did not check how the shared player reacts to that session's position events, and did not read the app's volume and mute settings. A preview of the meeting selected in Recordings could start the shared player's audio as well, and previews ignored mute.
- **Impact:** Review rejected the PR once; one extra fix commit and CI cycle.
- **Source evidence:** Review of #299 at 2eea863c; fix in 4142f869 with tests for both cases.
- **Correction / remaining risk:** Clip sessions now hide their events from the shared player, previews stop other playback and are stopped by it, and they use the stored volume and mute. Low risk. Check every consumer of a shared event channel before borrowing it.
