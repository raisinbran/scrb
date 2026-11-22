### A-1069 — 2026-11-22 — cloud #419 source CI — synthetic-test regex lint rejection

- **Observed failure:** The first source PR #431 macOS job on [CI run #45014768866](https://github.com/raisinbran/scrb/actions/runs/45014768866) failed `npm run lint` because two regular expressions in the new `hosted-win-installer-single-runner.test.mjs` triggered ESLint `no-regex-spaces`.
- **Cause:** Newly authored test source used literal pairs of spaces in regular expressions instead of quantified ` {2}`.
- **Effect:** One failed application CI job before tests; no runtime producer, Windows account, private asset, upload or owner machine action.
- **Correction:** Replaced the literal-space regex syntax with ` {2}`, retained identical matching semantics and observed successful lint on the changed head.
- **Residual:** Only exact-head CI and separate formal review can clear the final PR source; no installer evidence has been obtained.
