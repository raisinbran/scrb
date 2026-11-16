### A-599 — Focused jump assertion did not account for jsdom's zero word rectangle

- **Status / attribution:** Confirmed agent-authored test expectation error.
- **What failed:** After direct word alignment was added, the existing user-jump test expected the old row-top offset. jsdom reports the active word at viewport top (0 px), so the correct mock behavior moves the scroller up an additional 24 px to put the word at its top margin. The first focused run observed 1392 px versus the test's 1416 px.
- **Agent-controlled cause:** The existing assertion modeled only the row offset and did not include the new word-alignment behavior or jsdom's zero rectangle.
- **Impact:** One focused test run failed; the expected value and test comment were corrected. The suite then passed 11/11.
- **Evidence:** `TranscriptTab.follow.test.tsx` and focused Vitest output.
- **Correction / prevention:** Model the active word's mocked bounds and assert the resulting word-aligned scroll offset.
