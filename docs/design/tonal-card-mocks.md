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

## Owner comments, round 7

| Comment             | Change                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Padding             | One token, `--space-card-pad` (16px), is the inner padding of every card and panel: meeting header, tab content, player bar, list column, Settings and Vocabulary panels. Text, inputs, buttons and tabs start on the same inset |
| Tabs                | Transcript, Summary and Audio take the same horizontal padding, so the selected label sits on the panel's text edge. The tinted transcript line bleeds into the padding so its text aligns too                                   |
| Recordings filters  | Source, From and To live in the search field as chips. Click the field, press Down, type `source:`, `from:` or `to:`, or use the filter button; Backspace or the x removes a chip. The list gets the freed height                |
| Processing progress | The bar sits one row gap after the badge. A known percentage fills left to right; none sweeps one way and restarts (static for reduced motion)                                                                                   |
| Banners             | Every banner floats over the panel's top edge (zero height, raised) and never moves the content below: popup banners, app-level notices, the live-stop notice, list notes, summary banners                                       |
| Long titles         | An ellipsis at rest; after 400 ms of hover or focus the title scrolls to the end and back on leave. Reduced motion uses a tooltip with the full title                                                                            |
| Vocabulary          | Opens on the first suggestion, else the first enabled term                                                                                                                                                                       |
| Skip buttons        | Icon buttons with a circular arrow and 15 inside, named Skip back 15 seconds and Skip forward 15 seconds, with the usual tooltip                                                                                                 |

## Owner comments, round 8

| Comment            | Change                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search filters     | Clicking the search field opens a Filters dropdown (icon, plain wording, muted keyword) with More filters opening a dialog for Source and Before/After dates. Typing a keyword prefix narrows the rows |
| Banners            | One shared look: 75% of the panel, centred, same compact height, no border; the 640px cap is gone                                                                                                      |
| Vocabulary list    | One line per term with a Suggested or Disabled badge at the right; a segmented All / Suggested / Enabled / Disabled filter with counts replaces the group headers                                      |
| List column widths | Recordings, Settings and Vocabulary measured identical: 268.8px at 960, 302.4px at 1080, 320px at 1280 and 1920                                                                                        |

## Owner comments, round 9

| Comment            | Change                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banners            | Each box hugs its text, is centred, at most 75% of the panel, balanced so no word is left alone on a line. Several banners stack with a gap and never overlap   |
| Live               | Same cards, filled controls and spacing as the other screens, no borders; the idle panel is compact                                                             |
| Placeholders       | "Search recordings", "Search vocabulary" and "Search help" fit at 960 px                                                                                        |
| Detail header tags | The same tag component as the list, with full wording                                                                                                           |
| Help               | One scrolling page of all topics. The left list works like the Settings group list: click scrolls, scrolling highlights. One search field sits beside the title |
| Sidebar            | Toggle at the bottom beside Settings and Help; nav starts at the top. The sidebar is its own card, matching the other panels                                    |
| Import             | A compact "+ Import" button in the Recordings title row                                                                                                         |
| Vocabulary         | The usage note is an info icon with a tooltip beside the title; the state filter is a dropdown in the search field                                              |
| Narrow widths      | The player stays on one row: the volume slider hides at 1000 px or less. The window minimum width is 960 px                                                     |

## Owner comments, round 10

| Comment             | Change                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window width        | Minimum 720 px so a Windows half-screen snap is clean (768 px at 125% scaling). Checked at 720, 768, 800, 960, 1080 and 1920 in both themes                                                                           |
| Player              | One row down to 720 px: the volume track hides at 1000 px or less; at 900 px or less Mute goes and Show in transcript becomes an icon with a tooltip. The seek track takes the spare room                             |
| Compact lists       | Vocabulary terms and the Help and Settings group lists are 28 px rows                                                                                                                                                 |
| Location            | A searchable Country control, then a searchable State control that is only enabled for the United States, then a fixed-height note area. Nothing grows, shrinks or moves. The first-launch dialog uses the same field |
| Live consent banner | Pressing Start shows the standard banner over the transcript with the saved state's privacy wording, dismissible for that recording, and never over the controls. Live transcript uses the inset panel look           |
