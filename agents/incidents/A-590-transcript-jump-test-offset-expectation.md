### A-590 — Transcript jump test offset expectation

- **Status / attribution:** Confirmed agent-authored test expectation error; not a product defect.
- **What failed:** The first 420-word-turn regression run expected a scroll offset of 648 px. The correct value is 644 px from the test's 300 px viewport and 24 px margin; the code returned 644 px.
- **Agent-controlled cause:** The test's expected-value arithmetic was not checked against the margin formula before its first run.
- **Impact:** One focused test failed. The expectation was corrected; the follow suite then passed 10/10.
- **Evidence:** `TranscriptTab.follow.test.tsx`; sanitized record at `/private/tmp/scrb-transcript-jump-evidence-20261116.md`.
- **Correction / prevention:** Recompute the test value from the viewport and margin; demonstrated by the passing focused suite.
