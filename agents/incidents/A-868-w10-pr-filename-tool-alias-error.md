### A-868 — 2026-11-19 — W10 — open-PR filename check used an unavailable GitHub tool alias

- **Status / attribution:** Confirmed tool-name lookup error during final-build accounting preparation; no GitHub or repository state changed.
- **What failed:** A batch used a guessed `github_list_pull_request_changed_filenames` alias instead of the available `github_list_pr_changed_filenames` function, so the wrapper stopped before awaiting its other status results.
- **Impact:** One status-read batch was lost; no branch, PR, CI, package, installation, or recording action occurred.
- **Correction / remaining risk:** Use only the registered PR-filenames tool name and read the needed final status in a smaller batch. Low.
- **Publication:** This incident and its usage row are included in the final-build accounting draft PR branch; not on `main` pending review.
