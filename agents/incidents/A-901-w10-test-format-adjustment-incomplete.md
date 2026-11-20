### A-901 — 2026-11-20 — W10 — manual test formatting adjustment incomplete

- **What failed:** A second local Prettier check continued to warn on the Windows checkout. After formatting a separate workspace copy, Git's line-ending-normalized diff showed no content change, so the warning is attributable to local CRLF representation rather than test formatting.
- **Impact:** The staging test did not run in the combined command because the local formatting check returned nonzero; no application test failure was observed.
- **Correction / remaining risk:** GitHub stores the branch files with LF and the CI job runs the repository formatting step. Let that exact-host check validate the file; low.
