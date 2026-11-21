### A-965 — 2026-11-20 — W10 — GitHub CLI could not read its user configuration

- **Status / attribution:** Confirmed agent diagnostic attempt error; no GitHub request or repository mutation occurred.
- **What failed:** The restricted executor could not read the owner's GitHub CLI configuration under AppData, so the read-only API command stopped before contacting GitHub.
- **Impact:** The attempt did not obtain the PR commit tree SHA; connected GitHub tools remain available.
- **Correction / remaining risk:** Continue through the authenticated GitHub connector and avoid the inaccessible CLI configuration path. Low.
