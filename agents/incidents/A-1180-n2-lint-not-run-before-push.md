### A-1180 — 2026-11-25 — Claude — Pushed a lint error because lint was not run on the changed file

- **Agent:** Claude (Sonnet 5.5, Regiurn Windows local session)
- **What failed:** I added a citation-capture block to `agenda-compare.ts` and pushed it after type check and tests only; ESLint `no-useless-assignment` failed on both CI platforms.
- **Impact:** One failed CI cycle on PR #509; fixed in a follow-up commit.
- **Correction / remaining risk:** Run `npx eslint` on changed packages before each push. Low.
