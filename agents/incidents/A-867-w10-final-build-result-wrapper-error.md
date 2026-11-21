### A-867 — 2026-11-19 — W10 — final verification wrapper discarded completed command results

- **Status / attribution:** Confirmed result-collection error during final package verification; no source or package files changed.
- **What failed:** A JavaScript wrapper destructured three results from two parallel commands, then threw while formatting the completed test and hash outputs. The test result was not captured in the turn output.
- **Impact:** One redundant rerun of two focused test files was needed to recover evidence; no CI retry, install, launch, or recording occurred.
- **Correction / remaining risk:** Re-ran the focused tests once with corrected result handling; both files passed, 21 tests total. Hashes were independently read in a separate command. Low.
- **Publication:** This incident and its usage row are included in the final-build accounting draft PR branch; not on `main` pending review.
