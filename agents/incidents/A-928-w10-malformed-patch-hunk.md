### A-928 — 2026-11-20 — W10 — Patch hunk was malformed

- **Status / attribution:** Confirmed agent error; no file changed.
- **What failed:** A patch omitted the required diff prefix on a hunk line and was rejected.
- **Impact:** The intended local edit was not applied.
- **Correction / remaining risk:** Corrected the patch syntax before applying the edit. Low.
