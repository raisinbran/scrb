### A-423 — 2026-11-15 — Codex — restricted shell blocked score evidence write

- **Status / attribution:** Confirmed setup error; no data loss or application defect.
- **What failed:** Attempted to serialize the computed baseline-only score JSON with the bundled Python runtime from the restricted shell into the private assets folder, outside writable roots. The write was denied.
- **Impact:** The score JSON was not written by that invocation; computed values remained available in the scorer output.
- **Correction / remaining risk:** Saved the same scorer results through the authorized PowerShell write path, without rerunning the decode or rescoring. Low.
