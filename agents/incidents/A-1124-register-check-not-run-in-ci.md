### A-1124 — 2026-11-13 — Claude Code — register check added to `npm run check` but not to CI

- **Agent:** Claude (Claude Code; PRs #154 and #173 that added and extended `scripts/check-register-ids.mjs`)
- **Status:** confirmed from `package.json` and `.github/workflows/ci.yml`; found in the 2026-11-23 review.
- **What happened:** the register check (repeated A-numbers, incident headings, usage-row columns) was wired into `npm run check` only. CI runs typecheck, lint, tests and the boundary check as separate steps and never ran it, while AGENTS.md says `npm run check` fails on a repeated A-number, implying enforcement.
- **Impact:** three malformed incident files and one malformed usage row merged to main (A-1125); any repeated A-number would also have merged unnoticed.
- **Correction:** #459 adds `npm run check:register` to CI and repairs the four files.
- **Remaining risk:** none known once #459 merges.
