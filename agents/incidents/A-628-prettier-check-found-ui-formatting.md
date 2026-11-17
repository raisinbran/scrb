### A-628 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — formatting the UI changes

- **Status / attribution:** Confirmed author formatting omission; no runtime defect.
- **What failed:** The first focused Prettier check found formatting differences in the new Speakers E2E spec and Tooltip placement code.
- **Impact:** The format check did not pass on that attempt; no tests or app state were affected.
- **Correction / remaining risk:** Applied Prettier to both files; rerun the focused format check and repository checks before publishing. Low.
