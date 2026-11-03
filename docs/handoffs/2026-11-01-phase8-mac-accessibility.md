# Early Phase 8 macOS accessibility check

**Base:** `rosmont/early-phase45-mac-ui-20261101`. Preliminary. Run in Chromium on the mock UI on the owner's Mac, with keyboard input and CSS zoom. Continues Task 35 (PR 8). Not a conformance claim.

| Check                | Result                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| VoiceOver            | **Unmeasured.** Needs a person; turning it on is a system setting.                                           |
| Keyboard, dialogs    | Pass for Vocabulary Edit and Delete: focus enters, Shift+Tab wraps, Escape closes and returns to the opener. |
| Keyboard, transcript | Pass: arrows, Shift selection, Enter editor, Tab to speaker menu, undo and redo shortcuts.                   |
| Focus after removal  | **Fixed.** Deleting a term or opening a meeting dropped focus to the page. It now lands on the heading.      |
| Names and headings   | Pass: no unnamed controls on six screens; one `h1` each.                                                     |
| Focus ring contrast  | Pass: 7.32:1 light, 5.89:1 or better dark.                                                                   |
| 200% zoom            | **Fixed.** Live and Recordings overflowed sideways at about the minimum window size. Their rows now wrap.    |

## Open

1. Control borders are about 1.6:1 against the surface, under the 3:1 non-text guideline. A global token change is a visual decision for the owner.
2. Help overflows by 8 px at 200% on a mock placeholder note, with no control affected. Recheck with real notices.
3. The 200 px sidebar stays fixed at 200%, taking a large share of the window. It can be resized by drag; there is no keyboard route tested here.
4. Destructive results (term deleted, profile deleted) are not announced beyond the move to the heading. Judge this during the VoiceOver run.

## VoiceOver steps for the owner

Press Cmd+F5 in the running app. Check that sidebar items, dialog titles, the Live status line, new transcript alerts and each word cursor announcement are read. Note anything silent or read twice.
