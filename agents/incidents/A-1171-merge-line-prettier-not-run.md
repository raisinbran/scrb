### A-1171 — 2026-11-25 — Claude Code / Mac — Pushed without running Prettier on changed TypeScript

- **Agent:** Claude
- **Attribution:** Confirmed self-induced. `npm run check` does not run the CI Prettier step and I did not run it before pushing PR #504.
- **Evidence:** CI "Check Prettier on changed TypeScript" failed on macOS and Windows at 161f8150.
- **Impact:** One failed CI round and one extra push.
- **Correction:** Ran Prettier on the changed files and pushed.
- **Remaining risk:** Low; run `npx prettier --check` on changed files before pushing. Identifier checked against main and open PRs; unpublished reservations unknown.
