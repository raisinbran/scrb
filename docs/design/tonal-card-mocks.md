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
