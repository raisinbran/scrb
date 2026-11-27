# Tonal card mocks

Run `npm ci` and `npm run dev`, then open `http://localhost:5183/`. Use Settings to choose Light or Dark. Under Recordings, open the fictional **Weekly project sync** meeting. Add `?design=baseline` to the local URL and reopen the same screen to compare. The preview styles load only on the browser development server with the mock backend.

| Screen                  | Before                                                               | After                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings                | Boxed sections and a list of group links                             | Raised cards use aligned headings. The sticky group index highlights the section in view, including Location at the bottom. At 900 px, it sits above the cards. |
| Recorded meeting detail | Header, tabs, content, and playback bar share a continuous workspace | The header and player frame a single card for the tabs and their content. The selected tab uses a tonal fill.                                                   |

Both screens reuse the existing controls, copy, and mock fixtures.

## Refinement (supersedes PR #518)

| Problem in the first mocks                                                                                                                | Change                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards, nav and tab bar used mixed existing surfaces, so steps between layers were uneven and in dark the cards barely lifted off the page | Four stepping tokens in both themes: page, card, inset (tab bar, selected nav item) and a soft card edge. Cards are always lighter than the page in dark and white on grey in light                                                      |
| Corners of 4px read as accidentally not sharp                                                                                             | `--radius` is now 10px for panels and cards; new `--radius-control` is 6px for buttons, inputs, selects, tabs, tooltips, banners and small bars. Every former `var(--radius)` was sorted into one of the two; no hardcoded numbers exist |
| Selected tab and nav item used the loud selected grey                                                                                     | Selected tab takes the card tone on the inset bar; selected nav item takes the inset tone                                                                                                                                                |
| Light mode tinted only light, dark used a different backdrop path                                                                         | One backdrop rule for both themes                                                                                                                                                                                                        |

The radius change applies to the whole app, not only the preview; the tonal layering remains preview-only on the dev server.

## Questions for the owner

- Are 10px and 6px right, or should panels go to 12px?

- Does the playback card have enough prominence when you move between Transcript, Summary, and Audio?

## Owner comments, round 3

| Comment                          | Change                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap under the recording title    | The title kept an empty reserved line for errors. It now exists only while an error shows                                                                                    |
| No borders on buttons and panels | Buttons, icon buttons, tabs, badges, cards and the save bar lose their outline in the preview; a fill and radius separate them. Inputs keep a subtle edge for field contrast |
| Tabs outside the transcript card | Transcript / Summary / Audio, undo, redo, A- and A+ are a row of buttons on the page above the card. The card holds only content                                             |
| Recordings list                  | Each recording is a row in a card, with the Settings group list's hover and selected look (shared `ListItem.module.css`). The list scrolls inside its card                   |
| Gutter between panels            | One token, `--space-card-gap` (8px, was 12px), used between cards in Settings, Recordings and the meeting view                                                               |
| Wasted width                     | Sidebar 140px (was 160px) with tighter padding; the Settings group list hugs its labels; the settings and meeting panels use the freed width. The group list stays sticky    |

## Owner comments, round 4 (Layout B)

| Comment                 | Change                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One layout everywhere   | Sidebar, optional second column, content panel. Recordings and Settings share `SplitLayout`; the other screens are a single content card with the same gutters     |
| Recordings              | The list is the second column with search, Import and filters pinned above it. An open meeting shows beside it; with none open the panel says "Select a recording" |
| Settings                | The group list is the second column, content on the right. The old top pills are gone                                                                              |
| Sidebar toggle          | A button at the top of the sidebar switches icons only on and off; the choice is saved. At 1000px or narrower it collapses on its own                              |
| Compact list rows       | Speaker count, status badge and a short progress bar share one line. "Text will change" is no longer in the list                                                   |
| Speakers and Vocabulary | Not turned into list plus detail: their rows carry actions and have no detail view, so they use the single content card                                            |

## Owner comments, round 5

| Comment                 | Change                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button states           | Three looks. Selected is unchanged (card tone). Idle is a soft neutral fill with full-strength text, now also on unselected tabs, so tabs match undo, redo, A- and A+. Disabled keeps muted text and a fill at 30% of idle, so it nearly vanishes |
| Idle fill on the page   | New tokens `--color-control` and `--color-control-hover` in both themes: slightly recessed against the page, so the lighter selected tab stands out. Contrast is tested like the other surfaces                                                   |
| Back button             | The "< Recordings" button is gone from the meeting panel; the list column stays beside it at every width. Pressing Recordings in the sidebar still closes the open meeting                                                                        |
| Speakers and Vocabulary | Unchanged for now                                                                                                                                                                                                                                 |

## Owner comments, round 6 (Vocabulary V-B)

| Comment    | Change                                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vocabulary | Now `SplitLayout`: search and the usage note on top of the column, then Suggested, Enabled and Disabled groups with counts. The selected term gets a panel sized to its content plus a small History panel; a suggestion shows counts, Remember and Dismiss |
| Speakers   | Unchanged                                                                                                                                                                                                                                                   |
