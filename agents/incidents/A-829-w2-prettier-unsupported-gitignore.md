### A-829 — 2026-11-18 — Prettier check included an unsupported file

- **Status / attribution:** Confirmed agent command error; no source defect.
- **What failed:** The formatting command passed `.gitignore` to Prettier, which has no parser for that file. I repeated this same invalid scope once during the W2 corrections on 2026-11-18.
- **Impact:** The combined formatting command exited before reporting source formatting.
- **Correction / remaining risk:** Re-ran Prettier on the YAML and JavaScript files; both passed. `git diff --check` also passed. Low.
