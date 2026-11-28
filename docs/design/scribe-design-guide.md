# Scribe design guide

Read this before any UI work. It describes the app as it is, so a change looks like it was always there. Baseline source was checked against `main` at `73e899d0` on 2026-11-20; pending PR #383 changes are explicitly distinguished from already-merged behavior. If this guide and the code disagree, the code wins: fix the guide in the same PR.

Source of truth: tokens in `apps/desktop/src/ui/theme/tokens.css`, shared pieces in `apps/desktop/src/ui/components/`, screens in `apps/desktop/src/ui/screens/`, shell in `apps/desktop/src/ui/shell/`. Screen list and states: `dev-plan/Meeting Scribe - UI Specification.md`.

## Status: implemented vs pending

Checked against `origin/main` (`73e899d0`) on 2026-11-20. **Proposed** describes work on draft PR #383, not on main until merged and rebuilt.

**Implemented on main:** tokens and both themes; Button, IconButton, Tooltip (100 ms hover delay, theme tokens); PopupLayer/PopupBanner, Dialog, Menu, Progress; sidebar status icons (red pulsing mic, spinning disc); fixed 160px sidebar; Settings docked save bar; preset-locked controls with "Set by ..." tooltip and preset info tip; "Whole meeting" auto-delete wording; .docx/.pdf/.vtt names; Re-process tooltip; mini recording label gating, equaliser bars, Hide as a dash button left of Open Scribe, warning flag (PR #305); Live Mic/Meeting levels beside the two pickers (PR #288/#315); and Test mic with mic-only level meter inside Settings (PR #288/#315).

**Proposed on draft PR #383:** instant themed tooltips (including the mini window), removal of Settings/Help pointer underlines/shadows, regression coverage for their hover tips, and positioning Settings Test mic above Input Profile. These source changes are not proof that the already-built Mac A2 package contains them.

**Owner rules not yet fully in code:** the mini window still uses its own `data-tip` tooltip instead of the shared component (PR #383 makes it immediate and themed); remaining row-style notices (import voice-profile notice, Live and mini-window alerts, Settings inline error line).

## 1. How to use this guide (short version)

1. Find the existing screen or component closest to what you need. Copy its pattern.
2. Reuse a shared component. Never write a second button, tooltip, banner, dialog or meter.
3. Colours, spacing, type sizes and radius come from tokens only.
4. Finish with the checklist in section 14 and tick every line in the PR.

When unsure, do less and match what exists. A plain screen that matches beats a clever one that does not.

## 2. Principles and why

| Principle      | Meaning in this app                                                                                                                                   | Why                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Calm           | Few colours, little motion, no decoration. Nothing moves unless it reports a real state.                                                              | A meeting tool stays open for hours beside a call. It must not pull the eye. |
| Legible        | Large enough text, AA contrast on every surface, transcript size adjustable.                                                                          | People read live text at a glance, mid-conversation.                         |
| Keyboard first | Every action reachable by keyboard, visible focus ring, shortcuts for start/stop, pause, jump to live, undo, redo.                                    | Hands are often busy; accessibility is a requirement, not a bonus.           |
| Accessible     | Names for every control, roles on status and alerts, reduced motion respected.                                                                        | Screen-reader and low-vision users must get the same facts.                  |
| No surprises   | Same place, same look, same wording for the same thing. Nothing floats over controls. Destructive actions confirm.                                    | A non-technical owner must predict what a click does.                        |
| Honest status  | Recording health and transcription lag are separate. Say "provisional" when text will change. Never show a setting as active when nothing applies it. | Trust in a recorder depends on never overstating.                            |

## 3. Why a dark, low-glare, single-accent theme

- The app is used next to video calls, often in dim rooms and for long stretches. A dark surface (`--color-surface` `#2b2d31`, not pure black) reduces glare while text stays bright (`#f2f3f5`).
- One accent (soft indigo, `--color-accent`) marks the primary action and focus. Red, amber and green are reserved for status (recording, paused/warning, ok), so colour always means something.
- Contrast is not a taste call: `theme/theme.test.ts` fails the build if any text token drops below WCAG AA 4.5:1 on any surface, in both themes.
- Dark is the design centre. **A Light theme also exists** and Settings offers Light, Dark and System (`ThemeSetting`; System follows the OS, default is System). Every token must exist in both themes; a test enforces matching names.

## 4. Colour system

All values live only in `tokens.css`. A test fails any `#hex`, `rgb()` or `hsl()` in any other `.css` or `.tsx` under `ui/` (SVG path data is exempt).

| Token                                                | Use                                                                                                          | Do not use for                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `--color-app`                                        | Window frame behind everything                                                                               | Panels                           |
| `--color-surface`                                    | Main workspace, inputs                                                                                       | Raised cards                     |
| `--color-surface-sidebar`                            | Sidebar, Settings section boxes                                                                              | Workspace                        |
| `--color-surface-raised`                             | Dialogs, popups, tooltips, save bar                                                                          | Page background                  |
| `--color-surface-hover`                              | Hover fill                                                                                                   | Selected state                   |
| `--color-surface-selected`                           | Selected tab or item, meter track                                                                            | Hover                            |
| `--color-page`, `--color-card`, `--color-card-inset` | Tonal design (the app's one design): backdrop, card, and the step inside a card (tab bar, selected nav item) | Dialogs and popups               |
| `--color-border`                                     | Every 1px border and divider                                                                                 | Text                             |
| `--color-text`                                       | Body and headings                                                                                            | Hints                            |
| `--color-text-muted`                                 | Hints, secondary lines, inactive items                                                                       | Anything that must be read first |
| `--color-word-idle`, `--color-word-current`          | Transcript word states                                                                                       | Other text                       |
| `--color-accent`, `--color-on-accent`                | Primary button, focus-adjacent emphasis, checkbox colour; text on accent                                     | Status                           |
| `--color-focus`                                      | Focus ring only                                                                                              | Decoration                       |
| `--color-recording`                                  | Recording only                                                                                               | Errors                           |
| `--color-paused`, `--color-warning`                  | Paused, warnings                                                                                             | Errors                           |
| `--color-ok`                                         | Success, level meter fill                                                                                    | Neutral info                     |
| `--color-danger`                                     | Errors, destructive actions                                                                                  | Warnings                         |
| `--color-backdrop`                                   | Behind modal dialogs                                                                                         | Anything else                    |
| `--shadow-overlay`                                   | Dialogs, popups, tooltips, save bar                                                                          | Flat panels                      |

Rules:

- Never write a raw colour. Never invent a token inline. A new colour needs a token in both themes plus a contrast entry in `theme.test.ts`, and an owner-visible reason.
- Never use colour alone for meaning: pair it with text or an icon (the sidebar mic is red _and_ announces "Recording in progress").
- Native checkboxes, radios and sliders get the accent through `accent-color` in `tokens.css`. Do not restyle them.

```css
/* Do */
.note {
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}
/* Don't */
.note {
  color: #888;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

## 5. Typography

| Token                    | Size                          | Use                                             |
| ------------------------ | ----------------------------- | ----------------------------------------------- |
| `--text-xs`              | 12px                          | Tooltips, meter labels, fine print              |
| `--text-sm`              | 13px                          | Help text under a control, warnings in sections |
| `--text-md`              | 14px (body, line-height 1.45) | Everything default                              |
| `--text-lg`              | 18px                          | Dialog titles, empty-state titles               |
| `--text-xl`              | 22px                          | Screen title (`h1`)                             |
| `--transcript-font-size` | 15px default, user adjustable | Transcript only                                 |

- Fonts: `--font-sans` (system UI stack: `system-ui`, `-apple-system`, Segoe UI) and `--font-mono` (paths, timers). **No web fonts are loaded**; the app matches each OS and never waits on a download.
- Weights: 400 body, 600 for headings, labels, the active sidebar item and primary buttons. Nothing heavier.
- Sentence case everywhere. No ALL CAPS, no letter-spacing tricks.
- One `h1` per screen, from `<Screen title>`. Dialogs use `h2`.
- Clocks and timestamps use the surrounding text's font, not monospace (monospace looked too large; `theme/timer-font.test.ts` enforces it). `--font-mono` is for paths and similar.

## 6. Spacing, radius and rhythm

Grid is 4px, steps are tokens:

`--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 24 · `--space-6` 32 · `--space-7` 48

- **Layout B (every screen):** left sidebar | optional second column (a scrollable list) | content panel. Screens with a list (Recordings, Settings, Vocabulary) use `screens/SplitLayout.tsx` and nothing else: one fixed column width (`clamp(200px, 24vw, 280px)`), title at the top of the column, an optional pinned header (search, filters, actions), then the list on its own scroll; the content panel scrolls on its own too. List rows use `components/ListItem.module.css` (`list` and `item`: same padding, radius, hover and selected tint). Screens without a list (Live, Speakers, Help) are one content card on the page tone with the same outer gutter. Do not invent another screen layout, and do not use top pills for sections.
- **Sidebar:** labels and icons by default; a toggle at its top shrinks it to icons only (state saved in the browser's local storage under `scrb.sidebar.collapsed`, since the contract has no field for it). Icons-only items keep their names for screen readers and show them in the shared tooltip. At 1000px window width or less it collapses on its own and the toggle is disabled.
- **List rows with status:** the status badge sits on the same line as the speaker count; a processing meeting shows a short fixed-width bar on that line (outside the row button so it keeps its progress role). No separate rows for status.
- **One inner padding:** `--space-card-pad` (tokens.css) is the padding of every card and panel. Text, inputs, buttons and tabs start that far from the card edge; a row with its own tint (list rows, transcript lines) extends into it by its own padding so its text lands on the same edge. No one-off panel paddings. Every button, input and tab inside a card, including toolbars, footers, player bars and floating buttons such as Jump to Live, keeps at least `--space-card-pad` from every edge of that card; none touches it (`e2e/transcript-control-inset.spec.ts` enforces this for the transcript cards).
- **Banners never push content:** every banner, notice and note is an overlay (absolutely positioned, raised, higher z-index) in a space that is always reserved and empty, so it moves nothing and hides no text: the meeting panel keeps a 40px strip at its top (`--popup-gutter`); app notices and list notes float at the bottom edge. Showing or dismissing one must not move or resize anything below it. Use `PopupLayer`/`PopupBanner`; `overlays.test.ts` guards the rule.
- **Progress bars:** a known percentage fills left to right; with none, a short soft segment sweeps left to right and restarts (never back and forth); reduced motion shows a static partial fill. Keep `role="progressbar"`.
- **Recordings search:** clicking into the field opens a Filters dropdown: rows with an icon, plain wording and the typed keyword in muted text (`source:`, `from:`, `to:`), then More filters, which opens a dialog (Source, Before/After dates, Clear filters, Cancel, Apply filters). Typing a keyword prefix narrows the rows; a picked filter becomes a chip in the field; the x or Backspace removes it. Escape, an outside click and Tab-away close it.
- **Skip buttons:** `SkipButton`, an open circular arrow with 15 inside, clockwise to skip forward and mirrored to skip back.
- Tonal design (the only design in every build, set by `data-design="tonal"` in `index.html`; `e2e/tonal-design.spec.ts` checks it in Electron): one gap, `--space-card-gap` (8px), between stacked cards and panels. Buttons, tabs, cards and panels have no outline: a fill (`--color-card-inset` inside a card, `--color-card` on the page background, set per row with `--btn-fill`) and the radius separate them. Every button, tab and toggle has three looks: selected (card tone, unchanged), idle (soft neutral fill, full-strength text; on the page use `--color-control` with hover `--color-control-hover`, set per row with `--btn-fill` and `--btn-hover`) and disabled (muted text, fill at 30% of idle so it nearly vanishes into the background; stays legible). The keyboard focus ring stays. Inputs and selects keep their subtle edge so the field passes non-text contrast. List-style menus (Settings groups, the Recordings list) share `components/ListItem.module.css`: hover `--color-card-inset`, selected `--color-page`. Secondary menus hug their content; the main panel takes the rest.
- Two corner radii: `--radius` (10px) for panels, cards, dialogs, menus, section boxes and the save bar; `--radius-control` (6px) for buttons, inputs, selects, tabs, list items, tooltips, banners (compact strips), badges and small bars. A test allows only those two tokens, `50%` or `0`. The mini window is exempt from the test but uses `--radius-control`. A control inside a card is always one step tighter than the card.
- `--control-height` 30px: dropdowns, buttons and icon buttons that share a row are this tall so they line up.
- Screen padding: `--space-5` top, `--space-6` sides, max width 880px (`Screen.module.css`).

**Hard rules for rhythm**

1. **Equal gaps between sibling items.** Siblings in one row or column use one gap token, set with `gap` on the parent, not margins on children. Never mix 8px and 12px between neighbours.
2. **Every settings row and heading group repeats the same vertical spacing.** Settings sections are boxes with `--space-3` padding top/bottom, `--space-4` sides, `--space-3` between sections; legend sits `--space-2` above its contents; field grids use `--space-3` rows and `--space-4` columns. A new section copies these; it does not pick its own numbers.
3. No magic pixel values for spacing. The few px literals that exist are fixed sizes (30px controls, 64px meter), not gaps.
4. Fixed-size controls do not resize when their value changes (the sensitivity value box reserves `9ch` so "Automatic" and "-100 dB" take the same room; the slider itself is meant to be a fixed 220px, which is pending in PR #288). Test: change the value and confirm nothing shifts.

```css
/* Do */
.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
/* Don't */
.row > * + * {
  margin-left: 10px;
}
.row > button:last-child {
  margin-left: 14px;
}
```

## 7. Shell and screen layouts

**Window:** 40px title bar (`--titlebar-height`) with the recording indicator and elapsed time; sidebar fixed at 160px (no drag handle); workspace scrolls inside the remaining area on `--color-surface`. Usable at 1280×720 and up. The spec's right-hand **inspector panel and draggable panel sizes are not implemented**; do not add them.

**Sidebar** (`shell/Sidebar`): Live, Recordings, Speakers, Vocabulary; Settings and Help icon buttons in the footer. Items use muted text, hover fill, and `--color-surface-selected` + weight 600 for the current page (`aria-current="page"`). Footer hover/pointer focus never adds an underline or drop-shadow; keyboard focus keeps a visible focus ring. Settings/Help must both show an immediate theme-matched tooltip. Status lives on the icon: the Live mic turns red and fades while recording (steady amber when paused); the Recordings disc spins while any recording is processing or importing; with reduced motion the animation stops and a small accent badge appears instead.

**Live:** Start/Pause/Stop controls; Meeting app and Microphone pickers with the Mic and Meeting meters beside them in the same row, under a "Levels" label; elapsed time, transcript, privacy banner where it applies. Transcript rows: speaker name (underlined dotted when editable), timestamp link, text. Provisional text is italic. **Settings**, not Live, contains Test mic and its mic-only level meter; PR #383 positions them directly above Input Profile.

**Recordings:** list view with search and filters, import action; detail view beside the list (no back button; the sidebar Recordings item closes it), title, meta line, one action row (export, open meeting folder, open audio folder, optional Re-process, delete, Copy transcript at the far right), tabs Transcript / Summary / Audio. Copy transcript uses a shared icon button with the standard overlapping-documents icon and hover tooltip; it never adds a second row above transcript text. Tabs use `role="tablist"`, arrow keys move between them, the selected tab uses a tonal fill. Hints that explain a button go in that button's tooltip, not in a permanent paragraph.

**Settings:** stack of boxed sections (audio, transcription, summary, storage, auto-delete, theme and others). The Test mic button and mic-only meter sit together immediately above Input Profile inside the Audio section. Unsaved changes show a **save bar docked to the bottom of the panel**, out of the layout flow, with space always reserved so the last section is never covered and nothing shifts when it appears.

**Vocabulary:** `SplitLayout`. Second column: search field and the usage note pinned on top, then terms under Suggested (n), Enabled (n) and Disabled (n) headers (empty groups are hidden), each term one `ListItem` row with the selected tint. Content panel: the selected term's panel sized to its content (name, Heard as, Edit / Enable or Disable / Delete; a suggestion shows its correction counts with Remember and Dismiss) and a separate small History panel. With nothing selected it says "Select a term". The note "Terms are saved but not used for transcription yet." stays in the column header.

**Speakers:** `SplitLayout`. Second column: contacts-style rows (round initial, name, meeting count) with the selected tint. Content panel: a detail card for the selected voice (name, meetings and last heard, then Play sample, Rename, Merge into…, Split into…, Delete) and a Samples card when clips exist; delete errors use `PopupBanner`. Split into… is disabled with a tooltip because the contract has no profile-level split (see `docs/handoffs/profile-split-contract-gap.md`). In a meeting, the **Speakers** tab (between Summary and Audio) lists that meeting's speakers with Rename, Merge into… and Split into…. Empty state: `EmptyState compact` in the list column.

**Dialogs:** `Dialog` / `ActionDialog` (440px wide, 24px padding, title at `--text-lg`, actions right aligned with `--space-2` gap, 24px above them). Focus is trapped, Escape closes unless the dialog is required, focus returns to the opener.

**Mini recording window:** always-on-top, frameless, draggable (`-webkit-app-region: drag`, buttons are `no-drag`). Shows the speaker label only while a track is above -40 dBFS, equaliser bars (static with reduced motion), elapsed time, warning flag, then the button row: Pause/Resume, Stop, Hide (a minimise-dash button named "Hide mini window", tooltip "Hide (recording continues)") immediately left of Open Scribe. There is no expand toggle. The warning flag is focusable and its tooltip is the warning text. All on main since PR #305. Note: the mini window styles its tooltips with its own `data-tip` CSS rather than the shared `Tooltip`; a known inconsistency, do not copy it elsewhere.

## 8. Component catalogue

Always import these; do not re-implement.

### Button (`components/Button.tsx`)

Variants: `secondary` (default, bordered, transparent), `primary` (accent fill, weight 600, one per view), `danger` (danger-coloured text and border). 1px border, radius token, padding `--space-1` × `--space-3`, disabled = 0.6 opacity.

```tsx
// Do: one primary, the rest secondary
<Button variant="primary" onClick={start}>Start</Button>
<Button onClick={cancel}>Cancel</Button>
// Don't: a second primary, or a raw <button> with new CSS
<button style={{ background: 'purple' }}>Start</button>
```

### IconButton (`components/IconButton.tsx`)

30×30 square, 16px stroke icon from `ICONS` (24-unit grid, 1.75 stroke, round caps). `label` is required: it is the accessible name **and** the tooltip. Use `tip` for longer explanation. Add a new icon to `ICONS`, drawn as strokes, matching the others. Standard icons (owner rule): minimise is a **dash** ("-"), dismiss is an **X**, back is a chevron, delete is the trash. Never repurpose an icon.

```tsx
<IconButton label="Export" icon="export" onClick={openExport} />
<IconButton label="Delete" icon="trash" danger onClick={askDelete} />
// Don't: an icon-only <button> with no label or Tooltip
```

### Tooltip (`components/Tooltip.tsx`)

Wraps one control. Opens without a hover delay, instantly on keyboard focus, then fades in and out over 80ms; hides on leave, blur, Escape or click. Themed (raised surface, border, `--text-xs`) using the resolved Light/Dark/System color tokens. Existing accessible descriptions are preserved when the tooltip is open. Max 240px; `\n` makes a line break. Use it for: icon-only names, why a control is disabled or locked ("Set by Studio"), short explanations that replace a permanent paragraph. Never put essential information only in a tooltip: the control must still be usable and named without it. Do not use the `title` attribute for tips.

### PopupLayer and PopupBanner (`components/PopupBanner.tsx`)

For transient notices (errors, re-process notes, "final transcript is still being processed" with a `Progress` bar). `PopupLayer` is a zero-height sticky layer meant to be placed **first inside the panel it belongs to** (on main some layers still sit at a wider level; panel-anchoring is pending PR #315); banners overlay the panel's top, centred, max 640px, and never push content. `level`: `info` (accent edge), `warning`, `danger`. `role="alert"` only for errors the person must notice, otherwise `status`. Add `onDismiss` wherever dismissing makes sense.

```tsx
<PopupLayer>
  <PopupBanner level="danger" role="alert" onDismiss={clear}>
    <p>The folder could not be opened.</p>
  </PopupBanner>
</PopupLayer>
```

Hard rule: **a banner anchors to the panel it belongs to, never to the whole page, and never covers a control the person needs.** If a banner would cover the action it talks about, move the layer to a panel that does not contain that control, or use an inline line. Check the screenshot at 1280×720.

Not converted yet (left as rows by design): the import list's per-file voice-profile notice, Live and mini-window alerts, the Settings inline error line. Do not copy those as the pattern for new work; use PopupBanner.

### Dialog / ActionDialog (`components/Dialog.tsx`)

Use for confirmations and short forms. Title is a noun phrase or verb phrase, sentence case. One confirm button (primary, or `danger` for destructive) plus Cancel. `ActionDialog` keeps the dialog open and shows the error if the action rejects.

### Menu (`components/Menu.tsx`)

`MenuButton` with `role="menu"`; arrows, Home, End move; Escape or Tab closes and returns focus.

### Progress (`components/Progress.tsx`)

`role="progressbar"`, 0 to 1 `fraction`. Omit `fraction` when the backend reports none: the bar then only shows that work is under way. Never fake a percentage.

### Level meter (`screens/live/LevelMeters.tsx`)

`role="meter"`, 8px tall, 64px wide, `--color-ok` fill on a `--color-surface-selected` track, range -60 to 0 dB, updated straight on the DOM (no React render per level). **Hard rule: any control that takes audio input shows this same meter, not a new one.** Reuse `LevelMeters` or its `Meter`; do not draw another bar.

### Toggles, radios, selects, sliders

Native elements, accent via `accent-color`. Selects get the shared caret and ellipsis from `tokens.css` (`:root:root select`); do not add your own arrow. Control rows: label (600) above the control for grids, label to the right of a checkbox for toggles, help text below at `--text-sm` muted. A control owned by a preset is **disabled, dimmed 0.55, with a "Set by <preset>" tooltip**.

### Tabs

`role="tablist"` / `tab` / `tabpanel`, `aria-selected`, arrow keys. See `MeetingDetailView`.

### Lists and empty states

`ItemList`/`Item` for simple rows; `EmptyState` (title at `--text-lg`, one sentence, centred; `compact` inside a section). `DataView` renders the shared loading and failed states.

### Other shared pieces

`DismissButton` (X with tooltip), `RecordingDot`, `PlayingIndicator`, `PrivacyBanner`, `LocationField`, `FirstLaunchLocation`, `SpeakerLabel`. Search `components/` before building anything.

## 9. States

| State            | Pattern                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty            | `EmptyState`: what is empty plus the one next step. No illustration.                                                                                                                                                                                       |
| Loading          | `DataView`: holds the screen's space, shows "Loading…" only after 300ms so quick loads never flash. Use `Progress` for long work.                                                                                                                          |
| Error            | Say what failed and what to do. Screen load failure: `role="alert"` text via `DataView`. Transient: `PopupBanner level="danger" role="alert"`. Recording keeps running; say so when true.                                                                  |
| Disabled         | Native `disabled`; dimmed; explain why in a tooltip when it is not obvious.                                                                                                                                                                                |
| Focus            | Global 2px `--color-focus` ring with 2px offset from `tokens.css` on `:focus-visible`. Never remove it. The only exception, enforced by a test, is `h1[tabindex='-1']` (code-focused headings). Mouse clicks on sidebar items show no ring; keyboard does. |
| Recording        | Title-bar indicator with elapsed time; red = recording, amber = paused; sidebar mic red and pulsing.                                                                                                                                                       |
| Processing       | Spinning disc in the sidebar; banner on the meeting: "Final transcript is still being processed. This text is provisional…" with progress.                                                                                                                 |
| Provisional text | Italic transcript. User corrections are kept and said to be kept.                                                                                                                                                                                          |
| Unsaved          | Docked save bar (Settings).                                                                                                                                                                                                                                |

Every screen must handle every state the UI Specification lists for it. A state not designed is a bug.

## 10. Motion and feedback

- Motion only reports real state: mic fade, disc spin, equaliser bars, tooltip fade (120ms), meter smoothing (100ms).
- Every animation has a `prefers-reduced-motion: reduce` branch that stops it and keeps the information another way (colour, badge, static bars). Existing files with reduced-motion handling: tooltip, sidebar, progress, playing indicator, recording dot, mini window.
- Transcript navigation is functional feedback, not decoration: **Jump to Live** and **Jump to current position** should visibly accelerate and decelerate, and finish within one second even for distant virtualized rows. Live follow-along also moves smoothly. Never remove the motion to meet the time limit; bound its duration instead. Reduced-motion users get an immediate move.
- No bounce, slide-in, parallax or auto-playing decoration. Banners appear without moving content.
- Feedback for a click is immediate (hover fill, pressed state, busy state from `useAction`). Long actions show `Progress` or a busy label.

## 11. Accessibility checklist

- [ ] Every control has an accessible name (`accessibility.test.tsx` fails unnamed buttons, inputs, tabs).
- [ ] Reachable and operable by keyboard; tab order follows reading order; no keyboard trap except `Dialog` (which traps on purpose and returns focus).
- [ ] Focus ring visible on every control.
- [ ] Text contrast AA from tokens; meaning never by colour alone.
- [ ] Targets: icon buttons are 30px and sidebar footer buttons 36px; do not go smaller. Primary clickable rows are at least 30px tall.
- [ ] Errors `role="alert"`, status `role="status"`.
- [ ] Reduced motion respected.
- [ ] Meters have `role="meter"` with value; progress has `role="progressbar"`.
- [ ] Headings in order, one `h1`.
- [ ] Transcript text size adjustable (A− / A+ buttons) and not clipped at larger sizes.
- [ ] Screen-reader-only text uses the `.hidden` pattern in `Sidebar.module.css` (clip, not `display:none`).

## 12. Copy and wording

- Plain words for a non-technical reader. Say "speech recognition", not "ASR"; "the audio", not "the stream"; "your computer" not "the host".
- Sentence case for buttons, titles, labels, tooltips. Short: one idea per line.
- A button names the action: "Start", "Re-process", "Export", "Delete recording". Cancel and the confirm button are different words.
- File types appear as `.docx`, `.pdf`, `.vtt` (owner feedback).
- Wording must match what happens. Example from feedback: the auto-delete option that deletes everything is "Whole meeting", and the sentence under it lists what goes: the audio, the transcript, the summary and the exports. Test every option's sentence.
- Say what is true now. "Automatic" input sensitivity is only a label: nothing applies it yet (**not implemented**), so do not describe it as adjusting.
- Errors: what happened, what is safe, what to do next. No error codes, stack text or blame.
- Numbers: times as `00:28`, durations as "58 min", dates as "Oct 29, 2026, 9:00 AM".

## 13. Owner rules (hard rules, learned from feedback)

1. **Banners never cover controls.** They anchor to their own panel via `PopupLayer`, not the whole page. Example: the "final transcript still being processed" banner overlays the meeting panel's top-right but must not hide the title, the icon-button row or the tabs; if it would, shorten it or move the layer.
2. **Audio input shows live levels.** Anything that lets someone check or choose an input (Test mic, pickers) uses `LevelMeters`/`Meter`, same size and colour. On Live, Mic/Meeting meters stay beside both pickers under "Levels"; in Settings, Test mic's mic-only meter sits directly above Input Profile.
3. **Add a new button to the existing row, in a consistent position.** Do not float it or add a new row. Example: Hide is in the mini window's button row immediately left of "Open Scribe"; export, folder, audio folder and delete sit together in the meeting icon row.
4. **Icons are standard.** Minimise is "-", dismiss is X, trash is delete. One icon, one meaning, everywhere.
5. **One spacing token between sibling items.** See section 6.
6. **Reuse, never duplicate.** If a second copy of a component is tempting, extend the shared one. `MicTest` is kept self-contained so PR #288 can move it between screens with a three-line change.
7. **Explanations go in tooltips, not permanent rows.** Re-process, preset info and "Set by <preset>" all became tooltips. A permanent paragraph is for facts the person needs before acting.
8. **Do not add a hidden option.** A setting, field or contract change that is not approved stays out of the UI. `packages/contracts/` changes only with owner approval; if the contract lacks something, write a handoff note in `docs/handoffs/`. Example: a model picker or benchmark button needs approved contract changes, so it is documented in a handoff, not built.
9. **Do not show what does not work.** Hide or label honestly (see "Automatic" sensitivity).
10. **Layout does not shift.** Fixed-size bars, reserved space for the save bar, zero-height banner layer, delayed loading text.
11. **Colours only from tokens; radius only `--radius` or `--radius-control`.** Both are tests. Use a tonal fill for selected buttons and tabs. Keep the focus ring for keyboard focus.
12. **Mouse clicks leave no ring on sidebar tabs and footer buttons.** Keyboard focus keeps it.

## 14. Pre-merge UI checklist (copy into the PR and tick)

- [ ] Read this guide and matched the nearest existing screen.
- [ ] Spacing: only `--space-*`; sibling gaps equal; settings rows and headings use the standard rhythm.
- [ ] Controls inside any card keep the card inset (`--space-card-pad`); none touch the card edge.
- [ ] Colours: tokens only; no `#`, `rgb`, `hsl` outside `tokens.css`; radius is `var(--radius)` (panels) or `var(--radius-control)` (controls).
- [ ] Reused shared components (Button, IconButton, Tooltip, PopupBanner, Dialog, Progress, meters); nothing duplicated.
- [ ] Every icon-only control has a `label` and tooltip.
- [ ] Banners use `PopupLayer` inside the right panel and cover no control (checked at 1280×720).
- [ ] Any audio input control shows the shared level meter.
- [ ] Keyboard: reachable, operable, focus ring visible, Escape works where expected.
- [ ] States handled: empty, loading, error, disabled, plus the screen's own states from the UI Specification.
- [ ] Reduced motion handled for any animation.
- [ ] Wording: plain, sentence case, true to what happens.
- [ ] No unapproved contract, setting or hidden option added; UI imports only from `@scrb/contracts`, no backend modules.
- [ ] Mock backend matches the contract exactly (`ui/mocks/`); behaviour shown in mock mode equals real mode.
- [ ] Tests added or updated; `npm run check` passes (token, contrast, accessibility tests included).
- [ ] Screenshot of the changed view attached (light and dark if colours changed), or the PR says not verified in the running app.

## 15. Contemporary design: choices and where the app does them

| Practice                                  | In this app                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark theme first, accessible light option | Dark is the design centre; Light and System exist and share one token set with enforced AA contrast.                                          |
| One accent colour                         | Soft indigo `#9aa1f7` (dark) / `#4149b8` (light); status colours separate.                                                                    |
| Soft elevation                            | One shadow token, `--shadow-overlay`, only on floating things (dialogs, popups, tooltips, save bar). Flat panels use a 1px border instead.    |
| 4/8px grid                                | `--space-1` to `--space-7` (4, 8, 12, 16, 24, 32, 48); control height 30px.                                                                   |
| Generous hit targets                      | 30px icon buttons, 36px footer buttons, 160px sidebar with full-width items. Larger targets for primary actions are welcome, smaller are not. |
| System fonts                              | `system-ui` stack; no font downloads.                                                                                                         |
| Restraint with motion                     | Only state-reporting motion, always with a reduced-motion branch.                                                                             |
| Consistent rounded corners                | 10px panels and 6px controls, set by two tokens.                                                                                              |
| Responsive to the window                  | Grids wrap, text ellipsises, fixed controls keep their size. Not a mobile design: **not implemented** for phone widths.                       |

**Not implemented (do not assume):** inspector panel, draggable panel sizes, a high-contrast theme, a font-size setting beyond the transcript, a command palette, animations other than those listed in section 10.

## 16. Writing a new screen: recipe

1. Wrap in `<Screen title="…">`; load data through `DataView`.
2. Put a `PopupLayer` first inside the scrolling panel if the screen can show notices.
3. Group content in boxed sections like Settings (`--color-surface-sidebar`, 1px border, `--space-3`/`--space-4` padding).
4. Rows of controls: `display:flex; gap: var(--space-2)`; heights `--control-height`.
5. Add a CSS module per component; use only tokens.
6. Give each interactive element a name; wire Escape and arrow keys where a pattern exists.
7. Add the screen's states to the mock backend (`ui/mocks/`, dev menu: Ctrl+Shift+Alt+D) and cover them with a test.
8. Run `npm run check`; tick section 14.

- **One banner look:** every banner or notice that pops over a panel uses `components/Banner.module.css`: 75% of that panel's width, centred, compact padding, raised surface, no border (a coloured inner edge marks warnings and errors). Never set another width or look on a banner.
- **One list column width:** every two-column screen (Recordings, Settings, Vocabulary, and Speakers later) uses `SplitLayout`'s `clamp(240px, 28vw, 320px)` column and nothing else. Measured in the browser: 268.8px at 960, 302.4px at 1080, 320px at 1280 and 1920, identical on all three screens.
- **Vocabulary list:** one line per term (name, then a small badge for Suggested or Disabled, none for Enabled), a segmented All, Suggested, Enabled, Disabled filter with counts above, sorted Suggested, Enabled, Disabled. The misheard versions live in the detail panel.

## Round 9 rules

- Banners hug their text: `fit-content`, centred, at most 75% of the panel, `text-wrap: balance`. Stacked banners keep a gap.
- The playback row narrows by its own width (container query): volume track, then the Show in transcript text, then Mute go; last the seek track (at least 120 px) takes its own row. The window minimum width is 720 px.
- Deliberate exception to the soft idle fill: media transport icons (play, skip back, skip forward) have no idle fill. A round fill shows on hover, focus and press; the hit target stays 34 px. Speed and Show in transcript keep the normal button fill.
- The sidebar toggle sits at the bottom; the sidebar is its own card.
- Search fields show their full placeholder at 960 px. A title-row action (Import, info icon) sits right of the title.

## Round 13 rules

- Disabled controls keep the normal default cursor everywhere. Never use `cursor: not-allowed` (the crossed-out circle); greyed text and the faded fill already say it is off.
- Show in transcript is always in the player row, always an icon with a tooltip and `aria-label`. It is disabled while the transcript tab already follows the playhead, like Jump to Live in the live transcript, and enabled on every other tab.
- Banners hug their content: `fit-content`, minimum 280 px, at most 75% of the panel, 16 px symmetric horizontal padding, balanced text with a dismiss button after it in the same row. Stacks run vertically with a gap and overlay the content.
- Settings > Notifications has one checkbox per optional banner category (tips, summary, paused audio, privacy reminder, processing progress), all on by default and saved in the UI's own storage. Errors and anything that affects recording or data safety have no toggle.
- The first dismissal of an optional banner shows one temporary pointer to Settings > Notifications (8 s, once ever). It appears in the popup stack of the panel the person is in (Live, a recording, otherwise the app notices), looks like every other banner and moves nothing.
- Live transcript toolbar: the title "Live transcript" with the text-styles info icon on the left, only A- and A+ on the right. Undo and redo exist in the Recordings transcript only; live corrections stay on double-click and Ctrl+Z. Jump to Live sits in a fixed strip under the text, always present, and is disabled (default cursor) while the transcript already follows.

## Round 14 rules

- No banner gutter. The popup layer has zero height and banners float over the top of the card; every card keeps the same small top padding (`--space-card-pad`).
- Every optional banner has an X; only errors and recording or data-safety notices lack one. A dismissal lasts for that meeting or session and counts as the first dismissal for the one-time pointer. The pointer is persisted when it closes, so a dismissal with no pointer showing is never lost.
- Banners use the elevated tokens `--color-banner` (lighter than the card in dark, a cool off-white in light) and `--shadow-banner`, plus the coloured left accent for warning and danger.
- Button set (the only styles in use; add none without a stated reason):

| Role                                                     | Component                                                        | Size                                  | Padding                   | Type                     |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------- | ------------------------ |
| Text button (secondary, primary, danger)                 | `Button`, and the Recordings and Live text buttons that match it | min-height 30 px (`--control-height`) | `--space-1` × `--space-3` | `--text-sm`, primary 600 |
| Icon button, incl. A−/A+, undo/redo, export, trash, info | `IconButton`                                                     | 30 × 30, 16 px icon                   | none                      | none                     |
| Media transport (play, skip)                             | `IconButton`/`SkipButton`                                        | 34 px target, no idle fill            | none                      | none                     |
| Start and Stop (Live)                                    | `.startButton`/`.stopButton`                                     | 88 px wide, 30 px high                | `--space-1` × `--space-3` | 600                      |
| Tags and chips                                           | `Chip`                                                           | text height                           | `--space-1` × `--space-2` | `--text-xs`              |

The Live and Recordings transcript toolbars use the same two `IconButton`s for text size, so they match in size, radius and icon.

## Round 15 rules

- **Toggle rule (one sentence):** in content and detail panels, the selected tab or segmented option takes the dark fill (`--color-control`) and every available option takes the lighter fill (`--color-card` on the page, `--color-card-inset` inside a card); disabled is about 30% of the idle fill. Menus and lists (Help, Settings groups, the Recordings list, filter menus) keep their own selected style.
- Every segmented option and every button uses `--radius-control` and the shared button size; the selected segment never uses the accent colour.
- Stacked banners share one container: as wide as the widest banner (at least 280 px, at most 75% of the panel), centred at the top of the panel, each banner stretched to that width, 8 px between them, X at the top-right of each. The same container class is used by panel stacks, Live alerts and the app notices.
