### A-1013 — 2026-11-21 — Cloud — Incident A-1011 collision introduced in draft accounting PR

- **Attribution:** Confirmed self-induced cross-branch reservation error, not an application defect.
- **Failure:** The prior merge-audit task allocated draft PR #396's read-batch incident as A-1011 without seeing the earlier, independently reviewed A-1011 reservation subsequently published in PR #401. Both were different events. Each isolated-branch CI/check passed or was pending without detecting the public cross-PR duplicate.
- **Impact:** Publishing both unchanged would assign the same identifier to unrelated incidents and break reliable reporting; no application code, recordings or installed profile was touched.
- **Correction:** On the unmerged PR #396 only, preserved the original incident narrative in Git history, created A-1012 with the same event evidence, updated the 12-column merge-task usage reference, and removed A-1011 from the branch. The earlier PR #401 keeps its A-1011 and was approved/merged unchanged.
- **Prevention:** Before each new incident allocation, query current main, all open PR incident filenames, and any accessible documented reservations; merge/review publication may advance asynchronously.
- **Publication:** This correction and incident A-1013 are on draft #396 and require fresh exact-head CI/independent review before merge. The M5/W10 unpublished local reservations still require their own confirmation.
