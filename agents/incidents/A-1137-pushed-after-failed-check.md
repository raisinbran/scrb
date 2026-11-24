### A-1137 — 2026-11-24 — Claude Code — PR 471: committed and pushed after a failed `npm run check`

- **Agent:** Claude (Claude Code, Sonnet 5.5, Mac desktop app)
- **Status:** confirmed; corrected in the next commit.
- **What happened:** the command chain used `;` after `npm run check`, so the commit and push ran although lint failed (`'Buffer' is not defined` in `scripts/b0-track-sync.test.mjs`). Head `56519224` therefore carried a failing check. An earlier format run (`prettier --write scripts/*.mjs`) also reformatted unrelated scripts, which the independent review had to flag.
- **Impact:** one pushed commit failed lint locally; fixed by `cdd7b2ab`, CI on that head passed. Extra reviewer scope from the formatting churn. No owner data, app or recording involved.
- **Correction / remaining risk:** gate every commit and push on a successful check with `&&`; format only files this change owns.
