# Tonal card mocks

Run `npm ci` and `npm run dev`, then open `http://localhost:5183/`. Use Settings to choose Light or Dark. Under Recordings, open the fictional **Weekly project sync** meeting. Add `?design=baseline` to the local URL and reopen the same screen to compare. The preview styles load only on the browser development server with the mock backend.

| Screen                  | Before                                                               | After                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings                | Boxed sections and a list of group links                             | Raised settings cards, stronger section headings, and a framed group index. At 900 px, the index moves above the cards so the fields can use the full workspace width. |
| Recorded meeting detail | Header, tabs, content, and playback bar share a continuous workspace | Separate cards frame the meeting actions, tab controls, content, and player. The active tab retains its accent underline and gains a tonal fill.                       |

Both screens reuse the existing controls, copy, and mock fixtures.

## Questions for the owner

- At 900 px, should the Settings index stay in the document flow or remain visible as you scroll?
- Should the meeting tabs and transcript share one card, or is the gap useful for distinguishing navigation from content?
- Does the playback card have enough prominence when you move between Transcript, Summary, and Audio?
