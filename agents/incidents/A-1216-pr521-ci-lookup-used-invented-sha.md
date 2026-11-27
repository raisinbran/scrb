### A-1216 — 2026-11-27 — Codex — PR #521 CI lookup used an incorrect commit SHA

- **Agent:** Codex (model unavailable; Mac Codex desktop; Medium requested)
- **Status / attribution:** Confirmed self-induced lookup error; no repository or product change resulted from the lookup.
- **What failed:** I manually constructed a malformed full SHA for the first GitHub Actions status query instead of copying the pushed commit SHA. The query returned no runs, and I briefly reported that the lookup needed correction.
- **Impact and evidence:** The first Actions/status lookup returned empty results for the incorrect SHA. `git rev-parse HEAD` established the pushed commit as `4879dce0038d4a8c0efbab1516f45c2cfec7bd1b`; querying that SHA returned CI run `46053799601` in progress. No publication or repository state was changed by the erroneous lookup.
- **Correction / remaining risk:** Used the exact local commit SHA for the subsequent CI lookup. Low.
