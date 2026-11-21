### A-923 — 2026-11-20 — W10 — AMI diagnostic imported speaker logic from the wrong module

- **Status / attribution:** Confirmed agent error; no product change.
- **What failed:** The first temporary diagnostic imported `decideSpeakers` from `speakers.js`; that function is exported by `finalPass.js`.
- **Impact:** The diagnostic exited before model inference and yielded no evidence.
- **Correction / remaining risk:** Corrected the import and reran the bounded public-fixture diagnostic successfully. Low.
