### A-1123 — 2026-11-17 — Codex (BCHEN-W10) — meeting list parsed every whole transcript on each call

- **Agent:** Codex (BCHEN-W10 Windows 11; PR #347 usage row)
- **Status:** confirmed from the code; found in the 2026-11-23 review.
- **What happened:** PR #347 fixed saved speaker counts by reading and parsing each meeting's full transcript inside `listMeetings`, for every meeting, on every call, with no caching. The Recordings list, Speakers screen and processing label all call it.
- **Impact:** listing time and memory grow with the total size of all transcripts; with many long meetings this would slow the Recordings screen. Not observed by the owner yet.
- **Correction:** #458 caches the count per meeting and rereads only when the transcript file changes, with a regression test that fails without the fix.
- **Remaining risk:** `readSummaryState` still reads one summary file per meeting per listing; small files, not changed.
