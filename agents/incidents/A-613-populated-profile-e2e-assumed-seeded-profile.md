### A-613 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — populated-profile Electron regression

- The Windows exact-head CI run failed because the new 900px Electron regression searched for `Tomas Lindgren`, a profile not seeded in the test app's isolated library. The profile-action locator therefore timed out; application UI assertions before it passed.
- Corrected the test to create two invented profiles in its own temporary `@scrb/storage` library before launching Electron, allowing the actual Rename, Merge, Play sample, and Delete controls to render. Prettier and TypeScript checks pass after this correction.
- Remaining risk: the corrected Electron regression awaits a new exact-head Mac/Windows CI run; local Electron startup is unavailable in the sandbox (A-611).
