### A-964 — 2026-11-20 — W10 — Web open could not fetch the referenced GitHub pages

- **Status / attribution:** Confirmed agent tool-selection error; no GitHub state changed.
- **What failed:** The web reader returned a cache miss for the issue permalink and rejected the GitHub API URL.
- **Impact:** The referenced assignment was not obtained through web open; a connector call using the wrong argument also failed separately (A-963).
- **Correction / remaining risk:** Retrieved the exact assigned comment through the connected GitHub integration. Low.
