### A-898 — 2026-11-20 — W10 — GitHub API export retained Windows CRLF line endings

- **What failed:** The contents export sent the Windows checkout's CRLF bytes directly to GitHub blobs, while the base revision stores these text files with LF. The draft PR therefore showed broad line-ending churn across existing files.
- **Impact:** The draft PR was created with an unnecessarily large diff; no merge occurred and no source was lost.
- **Correction / remaining risk:** Replace the branch tree with the same file contents normalized to LF, verify the PR diff returns to the intended changes, then rerun CI and independent review on the corrected head. Low.
