### A-1214 — 2026-11-26 — Settings regression test used an unavailable matcher

- **Agent:** Codex (Desktop, Mac)
- **Observed effect:** The first focused run failed with an invalid Chai property. A companion tool call also hit an unbound workspace variable after it had started the test.
- **Attribution:** The test assumed that the suite enabled a DOM-specific assertion matcher, and the companion call referenced a variable outside its scope.
- **Correction:** Used the repository's ordinary attribute assertions and read the test session output directly. The full pre-push check covers the corrected regression test.
- **Remaining risk:** The initial failure was in the test harness and did not establish a product defect.
