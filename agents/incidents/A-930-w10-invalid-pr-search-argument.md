### A-930 — 2026-11-20 — W10 — PR search used an unsupported page-size argument

- **Status / attribution:** Confirmed agent tool-call error; no repository state changed.
- **What failed:** The GitHub PR search connector does not accept `per_page`; its supported result limit is `topn`.
- **Impact:** The first PR search returned an argument error and no search results.
- **Correction / remaining risk:** Reissued the bounded search with `topn` and verified the relevant open PRs. Low.
