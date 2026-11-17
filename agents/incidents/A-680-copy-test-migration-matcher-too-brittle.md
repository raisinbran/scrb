### A-680 — 2026-11-16 — UI authoring session — brittle test migration matched the wrong source block

- **Observed:** The first cloud-only transformation of the existing transcript-copy unit test stopped with a missing-block error before any GitHub write. A verbatim multi-line matcher assumed whitespace that was not in the transformed source.
- **Cause:** An overly exact in-memory test-rewrite anchor. No repository file was modified by the failed attempt.
- **Correction:** Rebuilt the test migration using bounded test-section markers, inspected the resulting unit test, and committed the corrected file on PR #341. The old test file was not deleted until the replacement had been created.
- **Remaining risk:** Full local unit execution was unavailable through this cloud session; exact-head CI and independent review are required.
