# Tonal card mocks

Run `npm ci` and `npm run dev`, then open `http://localhost:5183/`. Use Settings to choose Light or Dark. Under Recordings, open the fictional **Weekly project sync** meeting. Add `?design=baseline` to the local URL and reopen the same screen to compare. The preview styles load only on the browser development server with the mock backend.

| Screen                  | Before                                                               | After                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings                | Boxed sections and a list of group links                             | Raised cards use aligned headings. The sticky group index highlights the section in view, including Location at the bottom. At 900 px, it sits above the cards. |
| Recorded meeting detail | Header, tabs, content, and playback bar share a continuous workspace | The header and player frame a single card for the tabs and their content. The selected tab uses a tonal fill.                                                   |

Both screens reuse the existing controls, copy, and mock fixtures.

## Questions for the owner

- Does the playback card have enough prominence when you move between Transcript, Summary, and Audio?
