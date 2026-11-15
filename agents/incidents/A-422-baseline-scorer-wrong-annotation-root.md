### A-422 — 2026-11-15 — Codex — baseline scorer given the annotation archive root

- **Status / attribution:** Confirmed agent error; no decode or application defect.
- **What failed:** The first partial-baseline scoring invocation passed downloads/ami/ann to parse_ref, which expects the words subdirectory; it stopped with “no reference files for ES2003c”.
- **Impact:** One scoring invocation failed before producing a score file.
- **Correction / remaining risk:** Passed downloads/ami/ann/words to the existing scorer functions. They reported 6,077 reference words, 1,563 errors and 25.72% WER. No decode was repeated. Low.
