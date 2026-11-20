# Scribe design guide

Read this before any UI work. It describes the app as it is, so a change looks like it was always there. Everything here was checked against the code on `main` at 2026-11-15; where something is not built, the text says **not implemented**. If this guide and the code disagree, the code wins: fix the guide in the same PR.

Source of truth: tokens in `apps/desktop/src/ui/theme/tokens.css`, shared pieces in `apps/desktop/src/ui/components/`, screens in `apps/desktop/src/ui/screens/`, shell in `apps/desktop/src/ui/shell/`. Screen list and states: `dev-plan/Meeting Scribe - UI Specification.md`.

## Status: implemented vs pending

Checked against `origin/main` (60a58d67) on 2026-11-15. Statements below say which is which; a sentence marked **Pending** describes an open PR and is not on main until it merges.

**Implemented on main:** tokens and both themes; Button, IconButton, Tooltip (no hover wait, themed), PopupLayer/PopupBanner (as a sticky zero-height layer; today it is not yet anchored to each panel, see Pending), Dialog, Menu, Progress; sidebar status icons (red pulsing mic, spinning disc); fixed 160px sidebar; Settings docked save bar; preset-locked controls with "Set by ..." tooltip and the preset info tip; "Whole meeting" auto-delete wording; .docx/.pdf/.vtt names; Re-process tooltip instead of a permanent row; mini window label gating, equaliser bars, Hide as a minimise-dash button immediately left of Open Scribe, no expand toggle, and the warning flag with its tooltip (PR #305, merged); MicTest and LevelMeters on Live.

**Pending (open PRs):** #288 (meters beside pickers under "Levels", Test mic in Settings above Preset, fixed 220px sensitivity bar); #315 (mic test meter and spacing, "Levels" gap, banners placed inside the panel they belong to).

**Owner rules not yet fully in code:** panel-anchored banners (the rule is firm, the code is pending #315), the mic-test meter and spacing, the "Levels" row and the 220px bar above; the mini window's own `data-tip` tooltip instead of the shared `Tooltip` (also immediate and themed, pending component consolidation); remaining row-style notices (import voice-profile notice, Live and mini-window alerts, Settings inline error line).

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

| Token                                       | Use                                                                      | Do not use for                   |
| ------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `--color-app`                               | Window frame behind everything                                           | Panels                           |
| `--color-surface`                           | Main workspace, inputs                                                   | Raised cards                     |
| `--color-surface-sidebar`                   | Sidebar, Settings section boxes                                          | Workspace                        |
| `--color-surface-raised`                    | Dialogs, popups, tooltips, save bar                                      | Page background                  |
| `--color-surface-hover`                     | Hover fill                                                               | Selected state                   |
| `--color-surface-selected`                  | Selected tab or item, meter track                                        | Hover                            |
| `--color-border`                            | Every 1px border and divider                                             | Text                             |
| `--color-text`                              | Body and headings                                                        | Hints                            |
| `--color-text-muted`                        | Hints, secondary lines, inactive items                                   | Anything that must be read first |
| `--color-word-idle`, `--color-word-current` | Transcript word states                                                   | Other text                       |
| `--color-accent`, `--color-on-accent`       | Primary button, focus-adjacent emphasis, checkbox colour; text on accent | Status                           |
| `--color-focus`                             | Focus ring only                                                          | Decoration                       |
| `--color-recording`                         | Recording only                                                           | Errors                           |
| `--color-paused`, `--color-warning`         | Paused, warnings                                                         | Errors                           |
| `--color-ok`                                | Success, level meter fill                                                | Neutral info                     |
| `--color-danger`                            | Errors, destructive actions                                              | Warnings                         |
| `--color-backdrop`                          | Behind modal dialogs                                                     | Anything else                    |
| `--shadow-overlay`                          | Dialogs, popups, tooltips, save bar                                      | Flat panels                      |

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

- `--radius` is 4px and is the **only** corner radius (buttons, inputs, selects, panels, cards, popovers). A test allows only `var(--radius)`, `50%` or `0`. The mini window is exempt from the test but still uses the token.
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

**Sidebar** (`shell/Sidebar`): Live, Recordings, Speakers, Vocabulary; Settings and Help icon buttons in the footer. Items use muted text, hover fill, and `--color-surface-selected` + weight 600 for the current page (`aria-current="page"`). A mouse click shows no ring; keyboard focus does. Status lives on the icon: the Live mic turns red and fades while recording (steady amber when paused); the Recordings disc spins while any recording is processing or importing; with reduced motion the animation stops and a small accent badge appears instead.

**Live:** Start/Pause/Stop controls, two source pickers (meeting app, microphone), the Mic and Meeting meters (`LevelMeters`), elapsed time, transcript, privacy banner where it applies. Transcript rows: speaker name (underlined dotted when editable), timestamp link, text. Provisional text is italic. `MicTest` renders on Live on main. **Pending (open PR #288):** meters move into the same row as the pickers under a "Levels" label, and Test mic moves to Settings above Preset. Follow whichever is merged.

**Recordings:** list view with search and filters, import action; detail view with a back link, title, meta line, one action row (export, open meeting folder, open audio folder, optional Re-process, delete, Copy transcript at the far right), tabs Transcript / Summary / Audio. Copy transcript uses a shared icon button with the standard overlapping-documents icon and hover tooltip; it never adds a second row above transcript text. Tabs use `role="tablist"`, arrow keys move between them, the selected tab has an accent underline. Hints that explain a button go in that button's tooltip, not in a permanent paragraph.

**Settings:** stack of boxed sections (audio, transcription, summary, storage, auto-delete, theme and others). Unsaved changes show a **save bar docked to the bottom of the panel**, out of the layout flow, with space always reserved so the last section is never covered and nothing shifts when it appears.

**Speakers / Vocabulary:** `Screen` + `ItemList` rows (`--space-2` vertical padding, 1px border-bottom). Empty states use `EmptyState`.

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
2. **Audio input shows the Live meter.** Anything that lets someone check or choose an input (Test mic, pickers) uses `LevelMeters`/`Meter`, same size and colour. Pending (PR #288): in the Live row the meters sit beside the two pickers under a "Levels" label.
3. **Add a new button to the existing row, in a consistent position.** Do not float it or add a new row. Example: Hide is in the mini window's button row immediately left of "Open Scribe"; export, folder, audio folder and delete sit together in the meeting icon row.
4. **Icons are standard.** Minimise is "-", dismiss is X, trash is delete. One icon, one meaning, everywhere.
5. **One spacing token between sibling items.** See section 6.
6. **Reuse, never duplicate.** If a second copy of a component is tempting, extend the shared one. `MicTest` is kept self-contained so PR #288 can move it between screens with a three-line change.
7. **Explanations go in tooltips, not permanent rows.** Re-process, preset info and "Set by <preset>" all became tooltips. A permanent paragraph is for facts the person needs before acting.
8. **Do not add a hidden option.** A setting, field or contract change that is not approved stays out of the UI. `packages/contracts/` changes only with owner approval; if the contract lacks something, write a handoff note in `docs/handoffs/`. Example: a model picker or benchmark button needs approved contract changes, so it is documented in a handoff, not built.
9. **Do not show what does not work.** Hide or label honestly (see "Automatic" sensitivity).
10. **Layout does not shift.** Fixed-size bars, reserved space for the save bar, zero-height banner layer, delayed loading text.
11. **Colours only from tokens; radius only `--radius`.** Both are tests.
12. **Mouse clicks leave no ring on sidebar tabs and footer buttons.** Keyboard focus keeps it.

## 14. Pre-merge UI checklist (copy into the PR and tick)

- [ ] Read this guide and matched the nearest existing screen.
- [ ] Spacing: only `--space-*`; sibling gaps equal; settings rows and headings use the standard rhythm.
- [ ] Colours: tokens only; no `#`, `rgb`, `hsl` outside `tokens.css`; radius is `var(--radius)`.
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
| Consistent small radius                   | A single 4px radius.                                                                                                                          |
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
