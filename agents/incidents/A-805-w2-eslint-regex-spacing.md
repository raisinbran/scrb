### A-805 — 2026-11-18 — W2 CI rejected literal regex indentation

- **Status / attribution:** Confirmed agent implementation error; no product defect.
- **What failed:** The focused installer test used repeated literal spaces in regexes, triggering ESLint `no-regex-spaces` on both CI platforms.
- **Impact:** W2 exact-head CI failed at lint; later jobs were skipped. Type checks and formatting passed.
- **Correction / remaining risk:** Replaced indentation with explicit regex counts. Corrected exact-head CI passed on `e31b05b84d1884b787e1ffa3787840131271fc91` (run 44448834616). Low.
