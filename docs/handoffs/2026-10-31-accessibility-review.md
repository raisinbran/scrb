# Task 35 — scoped UI accessibility review (2026-10-31)

**Scope:** existing React UI and tests, not a conformance certificate. Inspected `Dialog.tsx`, `recordings/Modal.tsx`, `Recordings` and live transcript views, `Sidebar`, `HelpScreen` and shared `Screen`. Only concrete defects are fixed in this batch.

| Observation | Impact | Decision / evidence |
| --- | --- | --- |
| A dialog can initially focus its container, but Shift+Tab at the container was not trapped. When no enabled control exists, Tab could leave the modal entirely. | Keyboard user can reach controls behind an `aria-modal` dialog. | Fixed the container/no-focusable branches in both `components/Dialog.tsx` and `recordings/Modal.tsx`; added a reverse-Tab test in shared components. |
| The Help screen's additional licenses `useBackendData` loader was an inline function; the hook treats its identity as an effect dependency. | Repeated loading/announcements can occur on every render. | Fixed by defining a stable module-level `loadLicenses`. |
| The live transcript's visible row window, keyboard word selection and status announcements are already implemented; the recorded transcript also virtualizes rows and gives each playable segment a keyboard timestamp button. | No additional virtualization or bespoke keyboard handler warranted from source review. | Keep existing tests, run them before acceptance. |
| Real third-party notices are incomplete, and mock notices still contain placeholders. | About screen cannot claim full licensing information. | UI now explicitly reports unavailable verified notices; `scripts/audit-notices.mjs` inventories locked npm package versions. Full license texts and OS/model dependencies remain a release blocker. |
| Color/contrast, screen-reader announcements across async dialogs, titlebar focus behavior and zoom at 200% cannot be established from static source alone. | Potential assistive-technology and OS differences. | Verify installed macOS/Windows apps with keyboard-only, VoiceOver/Narrator, and zoom. Do not classify as confirmed defects without a failing observation. |

**Not run:** React/Vitest, Electron smoke, axe/contrast audit, keyboard-only UI walkthrough, VoiceOver, Narrator, or installed-app test. The new focus test has not executed. No changes to shared contracts or IPC for this review.
