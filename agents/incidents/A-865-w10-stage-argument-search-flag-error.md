### A-865 — 2026-11-19 — W10 — stage-option source search passed a flag-like pattern to ripgrep

- **Status / attribution:** Confirmed diagnostic-command error during final package preparation; no repository state changed.
- **What failed:** An `rg -n` query began its pattern with `--` without an option terminator, so ripgrep parsed the expression as a flag and returned an argument error.
- **Impact:** One failed source lookup; no files, package outputs, CI runs, installation, or recording were affected.
- **Correction / remaining risk:** Reissued the bounded lookup with the proper `--` terminator and retrieved the required stage script arguments. Low.
- **Publication:** This incident and its usage row are included in the final-build accounting draft PR branch; not on `main` pending review.
