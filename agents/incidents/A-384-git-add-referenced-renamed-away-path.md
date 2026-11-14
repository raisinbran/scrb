### A-384 — 2026-11-14 — Codex — Staging command referenced a renamed-away path

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** After `git mv` staged the incident renames, I passed the removed source filenames to `git add`; Git rejected the first missing pathspec.
- **Impact:** One failed staging command; no staged content was lost and no repository or user-data effect occurred.
- **Correction / remaining risk:** Stage the intended incident and usage-log paths with `git add -A`. None.
