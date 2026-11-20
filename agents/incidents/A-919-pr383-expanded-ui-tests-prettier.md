### A-919 — 2026-11-20 — Expanded UI PR #383 initial CI failed Prettier on two new tests

- **Classification:** Confirmed author formatting omission on new Mac UI regression tests, not a runtime behavior finding.
- **Observed:** Exact-head CI run 44810904470 at 92120ec7eeab1cf4882ea8c5f3575493fd4b5016 failed Windows and macOS at `Check Prettier on changed TypeScript`. Job diff required line wrapping two `compareDocumentPosition` assertions in `apps/desktop/src/ui/screens/screens.test.tsx` and a single-line `expect(css).toMatch(...)` in `apps/desktop/src/ui/shell/Sidebar.test.tsx`.
- **Correction:** Applied precisely those three formatter diffs in one atomic Git commit 4c82878e0ffc93e4bb98a64036dcdf1b3bb514ba, automatically starting exact-head CI run 44811309478. Preserve original failed run; final CI results not yet observed at incident creation.
- **Impact:** Extra automated CI and two formatting corrections. No product install, recording, owner actions or security permissions changed.
- **Publication:** Unreviewed cloud coordination branch only; distinct from previous initial tooltip-head Prettier incident A-916 and original rejected test-anchor A-915.
