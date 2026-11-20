### A-899 — 2026-11-20 — W10 — final-pass regression formatting check

- **What failed:** The local Prettier check reported a difference on the Windows checkout. Comparing the original and formatter output through Git's line-ending normalization showed no content-level change.
- **Impact:** The combined validation command stopped before the staging test ran; temporary source files were restored in `finally`.
- **Correction / remaining risk:** The GitHub branch stores LF-normalized blobs. Use the repository CI formatting step as the acceptance check; the staging test remains covered by the hosted check suite. Low.
