# Task 35 — initial accessibility audit

**Baseline main:** 7790843. **Type:** Diff with tests/findings. Added a descriptive accessible name to the privacy reminder dismissal and a synthetic RTL test for status/keyboard-operable button.

## Findings from inspected UI

| Priority | Finding | Action |
|---|---|---|
| High | Live transcript's virtualized row focus and word-selection keyboard path must be exercised at 8 hours and with screen reader | Test Tab, Enter, Space, Arrow keys, selection undo and focus restoration with synthetic data |
| High | Error dialogs and transient alerts need keyboard focus on appearance and on dismissal; verify there are no lost keyboard traps | Review `ActionDialog`, `use-action`, Recordings import/export controls with user-event and axe |
| Medium | Privacy reminder's generic Dismiss control was ambiguous to assistive tech | Changed the accessible name and added a test |
| Medium | Playback and long transcript status announcements may become excessively frequent | Throttle or use `aria-live='off'` for time updates; preserve explicit errors/pause changes as announcements |
| Medium | Color contrast and disabled/selected states need verified WCAG AA across Light/Dark/System | Existing token contrast checks are a foundation; test against real OS color schemes and 200% zoom |

## Acceptance

Run `npm run check`, UI RTL/Vitest tests, keyboard-only app smoke, contrast and axe tests on all screens, and screen reader checks (NVDA Windows, VoiceOver macOS) on installed builds. Check reduced-motion, resize/zoom, accessible labels on all icon buttons and that hiding a modal restores focus. **These checks were not run**.

**Recommendation:** keep a short issue list ranked by user impact; do not add accessibility-only UI bloat or empty decorative ARIA attributes.