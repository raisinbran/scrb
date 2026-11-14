# Accessibility audit, 2026-11-14

Scope: the V1 requirement "fonts can be resized, the full workflow works by keyboard, and focus is always visible", UI code only (`apps/desktop/src/ui/`). Method: reading the code of every screen and shared component, an automated test over the mock backend, and a visual look at the Live screen in a browser with CSS zoom. **No screen reader was available; nothing below claims screen-reader behavior.**

## Checked, no change needed

- **Focus ring:** one global `:focus-visible` rule in `tokens.css` (2px, contrast-tested color). Only code-focused `h1` headings drop it.
- **Dialogs and the Settings overlay:** focus moves in, Tab is trapped, Escape closes, focus returns to the opener; the rest of the app is `inert` behind Settings.
- **Menus:** arrow keys, Home/End, Escape; focus returns to the button.
- **Icon-only buttons:** all go through `IconButton`, `DismissButton`, the sidebar and mini window with an `aria-label`. The "Text styles" info button has a name and its tooltip shows on keyboard focus and hides on Escape.
- **Tabs and panels:** meeting tabs use arrow keys; sidebar and panel resize handles are focusable and move with arrow keys; the Live transcript is a focusable group with word-by-word keyboard movement and Live shortcuts.
- **Status not by color alone:** recording state has text ("Recording", "Paused") beside its dot, the sidebar dot has a text name, provisional and corrected transcript words differ by italics and a dotted underline, warnings are text.
- **Contrast:** the existing token test still passes (no colors added).

## Fixed

1. **Meeting title field had its focus outline removed** (`recordings.module.css`): only a 1px border color change showed focus. The global 2px ring now applies.
2. **Live source pickers overlapped at large zoom:** the Meeting app and Microphone pickers sat in one non-wrapping row, so at about 200% zoom in a small window the labels ran over each other. They now wrap (`LiveScreen.module.css`).

## Tests added

`apps/desktop/src/ui/accessibility.test.tsx`: every button, input, select and tab has an accessible name on Live (recording), Recordings, meeting detail, Speakers, Vocabulary, Help and Settings; the info tip is named and described on focus; recording state is exposed as text; no stylesheet removes the focus outline.

## Could not verify

- Screen readers (VoiceOver, NVDA): not available. Names and roles are checked only through the DOM accessible-name computation.
- Real app zoom: the Electron main process has no zoom code and no custom menu, so zoom depends on Electron's default View menu shortcuts; not tested in the packaged app. Sizes are in px, so browser zoom scales everything together; only the transcript text-size buttons change text alone.
- 150% and 200% zoom were judged only on the Live screen with CSS zoom in a browser. The other screens were not looked at at those sizes, and the minimum 800px window at 200% (about 400px wide) was not reviewed beyond the Live picker fix.
- Mini window (a separate Electron window) was reviewed in code only: its buttons have names and show a tip on focus, but it was not tabbed through.
- Focus ring clipping inside scroll containers was not checked.
