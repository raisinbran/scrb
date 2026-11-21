### A-961 — 2026-11-20 — Codex Desktop — PR #392 review inspection guessed incident filenames

- **What failed:** Two read-only `Get-Content` calls omitted the `w10-` filename prefix present on local incident records and returned file-not-found errors.
- **Impact:** No files changed or were exposed; time was spent on two invalid reads.
- **Correction / remaining risk:** Listed the available filenames, stopped guessing, and used the incident README for format. Low.
