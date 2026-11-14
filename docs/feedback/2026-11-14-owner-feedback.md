# Owner feedback after hands-on use of the dev build (2026-11-14)

Archival record, paraphrased from the owner's message. Not a plan; the work it led to is tracked in the PRs of the sessions listed at the end. Tested on the Mac with `scripts/m1.sh` on `main` after PRs #170, #168 and #197.

## Test results

1. **Real mode start:** works.
2. **Mini window Hide (#197):** works as described.
3. **Playback follow-along (#168):** seems to work but may not be consistent. Only two long recordings exist, both made the morning of 2026-11-13, before many updates; follow-along appears on some older recordings and not others.
4. **Mic mute/unmute (#170) and real-meeting run:** not reported yet.

## Mini window

- Hide is not where a Mac user expects it (compare every other Mac window); the same concern applies on Windows.
- The orange "Transcription behind" / "Transcription: catching up" status is excessive and reads like a false alarm. At minimum it must not appear on the mini window.
- Tooltips on the mini window must appear much faster (about 0.5 s at most, or the common standard).

## Recordings screen and controls

- Mute/unmute should be a speaker icon, slashed when muted. Buttons must never change size when state changes (the player scrollbar moves when the mute button resizes). General rule: buttons keep fixed size except in rare cases such as window resizing.
- Prefer icon buttons in general: undo, redo, export, delete, and the back button (a plain left chevron, placed better). No good idea yet for the "open meeting" and audio buttons. All icon buttons get tooltips that behave like the rest of the app.
- Tab titles must sit in the same place on every screen. The Live screen's title and content are badly mismatched with the other screens. The "Recordings" title should stay when a meeting is opened.
- A meeting's title is editable as soon as it is clicked, with the caret where the user clicked.
- Meetings show the time (hour and minute) next to the date.
- Meetings are auto-titled `YYYYMMDD` plus a 1 to 10 word topic generated from the transcript, for example "20261113 Quarterly Budget Review".
- Recordings tab needs text search with results presented like Discord's search, with at least a filter by recording date.

## Transcript editing and export

- Editing a word in the live transcript shows an error and does nothing.
- After selecting a word and opening the edit window, the purple rectangle around the word stays after clicking away.
- The pointer should be a normal arrow unless over selectable text; over a meeting transcript it should be a text cursor. Users must be able to select and copy text, including from a right-click context menu that also offers "Correct text" (another way into correction mode).
- Export must also offer `.vtt` (standard-conforming WebVTT; the backend may change as needed).

## Speakers

- Different-sounding voices in the meeting are not separated: only "You" (microphone) versus one "Speaker 1" (all of the meeting-app audio) comes out. The owner's most recent 3-minute recording has a lot of dialog and is the preferred test case. The owner permits analysis of the two long recordings and the recent one, to diagnose problems up to V1, locally only.

## App-wide look and layout

- The app needs its own icon instead of the generic Electron one.
- Use one corner radius everywhere, the one the "Import audio file" button uses now.
- Dropdown carets sit too close to the right edge: give them the same padding as the left padding between container edge and text, and keep text from overlapping them.
- The "Hide Inspector" text button is temporary; it may become a panel-toggle icon depending on what the inspector ends up holding.
- Settings becomes a gear icon at the bottom left; Help (?) sits at the right of that panel and looks like the other buttons (shared radius and padding rules). Settings opens as an overlay with a slight fade in and out, must not stop or disturb a recording, and clicking outside it returns to the app.

## Where the work went (2026-11-14)

Sessions started: app-wide UI polish (`ui-polish-3`), mini window (`mini-window-3`), transcript editing and context menu (`transcript-edit-ux`), VTT export and auto titles (`vtt-and-titles`), recording diagnosis for speakers and follow-along (`recording-diagnosis`), app icon (`app-icon`). The Recordings search bar waits until the UI polish merges. Approved that day: adding the `vtt` export format to the contract (nothing else).
